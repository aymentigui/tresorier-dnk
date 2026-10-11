'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { ChequeType } from '@prisma/client';

export async function previewExcelImport(formData: FormData) {
  await requirePermission('cheque:import');
  
  const file = formData.get('file') as File;
  if (!file) return { error: "Aucun fichier sélectionné." };

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (e) {
    return { error: "Fichier Excel invalide." };
  }

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) return { error: "La feuille de calcul est vide." };

  // جلب البيانات للمقارنة الذكية (الموردين، والفواتير)
  const fournisseurs = await prisma.fournisseur.findMany({ select: { id: true, nom: true } });
  const fournisseurMap = new Map(fournisseurs.map(f => [f.nom.toLowerCase().trim(), f.id]));

  const factures = await prisma.facture.findMany({ select: { id: true, numero: true, fournisseurId: true } });
  
  const validRows: any[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // تخطي رأس الجدول
    
    // الأعمدة المتوقعة: N° Chèque | Fournisseur | N° Facture | Montant | Date Emission | Type | Référence | Date Encaissement
    const numeroCheque = row.getCell(1).value?.toString().trim();
    const fournisseurName = row.getCell(2).text?.trim();
    const numeroFacture = row.getCell(3).text?.trim();
    const montantRaw = row.getCell(4).value;
    const rawDateCreation = row.getCell(5).value;
    const rawType = row.getCell(6).text?.trim().toUpperCase();
    const reference = row.getCell(7).text?.trim() || null;
    const rawDateDecaissement = row.getCell(8).value;

    const fournisseurId = fournisseurName ? fournisseurMap.get(fournisseurName.toLowerCase()) : null;

    let factureId = null;
    if (numeroFacture && fournisseurId) {
       const facture = factures.find(f => f.numero.toLowerCase().trim() === numeroFacture.toLowerCase() && f.fournisseurId === fournisseurId);
       if (facture) {
           factureId = facture.id;
       } else {
           errors.push({ line: rowNumber, message: `La Facture '${numeroFacture}' n'appartient pas au fournisseur '${fournisseurName}' ou n'existe pas.` });
           return; 
       }
    }

    let dateCreation: Date | null = null;
    if (rawDateCreation instanceof Date) dateCreation = rawDateCreation;
    else if (typeof rawDateCreation === 'string' && !isNaN(new Date(rawDateCreation).getTime())) dateCreation = new Date(rawDateCreation);

    let dateDecaissement: Date | null = null;
    if (rawDateDecaissement instanceof Date) dateDecaissement = rawDateDecaissement;
    else if (typeof rawDateDecaissement === 'string' && rawDateDecaissement.trim() !== '' && !isNaN(new Date(rawDateDecaissement).getTime())) dateDecaissement = new Date(rawDateDecaissement);

    const montant = Number(montantRaw);
    const type: ChequeType = rawType === 'SIMPLE' ? 'SIMPLE' : 'BANQUE'; 

    if (!numeroCheque) {
      errors.push({ line: rowNumber, message: "Le Numéro du chèque est obligatoire." });
    } else if (!fournisseurName) {
      errors.push({ line: rowNumber, message: "Le nom du fournisseur est obligatoire." });
    } else if (!fournisseurId) {
      errors.push({ line: rowNumber, message: `Fournisseur '${fournisseurName}' introuvable dans la base.` });
    } else if (!dateCreation) {
      errors.push({ line: rowNumber, message: "Date d&aposémission invalide." });
    } else if (isNaN(montant) || montant <= 0) {
      errors.push({ line: rowNumber, message: "Le montant doit être un nombre positif." });
    } else {
      validRows.push({ numeroCheque, fournisseurId, factureId, montant, dateCreation, type, reference, dateDecaissement });
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmImport(validRows: any[]) {
  await requirePermission('cheque:import');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  // 💡 Optimization: جمع الـ IDs باش نديرو Sync ضربة وحدة مع اللخر
  const affectedFactures = new Set<string>();
  const affectedFournisseurs = new Set<string>();

  for (const row of validRows) {
    try {
      await prisma.cheque.create({ 
        data: { 
          numeroCheque: row.numeroCheque,
          fournisseurId: row.fournisseurId,
          factureId: row.factureId,
          montant: row.montant,
          dateCreation: new Date(row.dateCreation), 
          type: row.type,
          reference: row.reference,
          dateDecaissement: row.dateDecaissement ? new Date(row.dateDecaissement) : null,
          statut: row.dateDecaissement ? 'DECAISSE' : 'EN_CIRCULATION'
        } 
      });
      successCount++;
      
      if (row.factureId) affectedFactures.add(row.factureId);
      if (row.fournisseurId) affectedFournisseurs.add(row.fournisseurId);

    } catch (e) {
      dbErrors.push(`Erreur d&aposinsertion pour le chèque N°${row.numeroCheque}.`);
    }
  }

  // ==========================================
  // 💡 BATCH SYNC: تحديث الفواتير والموردين دفعة واحدة
  // ==========================================
  if (successCount > 0) {
    // 1. Sync Factures
    for (const fId of affectedFactures) {
      const facture = await prisma.facture.findUnique({
        where: { id: fId },
        include: { cheques: { where: { statut: { not: 'ANNULE' } } } }
      });
      if (facture) {
        const totalPaye = facture.cheques.reduce((sum, c) => sum + Number(c.montant), 0);
        const montantF = Number(facture.montant);
        let pourcentage = montantF > 0 ? (totalPaye / montantF) * 100 : 0;
        pourcentage = Math.min(Math.max(pourcentage, 0), 100);

        let statut: 'PAYEE' | 'PARTIELLEMENT_PAYEE' | 'EN_ATTENTE' = 'EN_ATTENTE';
        if (pourcentage >= 100) statut = 'PAYEE';
        else if (pourcentage > 0) statut = 'PARTIELLEMENT_PAYEE';

        await prisma.facture.update({ where: { id: fId }, data: { pourcentage, statut } });
      }
    }

    // 2. Sync Fournisseurs (Cumul)
    for (const frId of affectedFournisseurs) {
      const validCheques = await prisma.cheque.aggregate({
        where: { fournisseurId: frId, statut: { not: 'ANNULE' } },
        _sum: { montant: true }
      });
      await prisma.fournisseur.update({
        where: { id: frId },
        data: { cumulMontant: validCheques._sum.montant || 0 }
      });
    }

    await writeAudit({
      action: 'IMPORT',
      entity: 'Cheque',
      description: `Import Excel : ${successCount} chèques ajoutés avec synchronisation financière.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/cheques');
    revalidatePath('/factures');
    revalidatePath('/fournisseurs');
  }

  return { successCount, dbErrors };
}