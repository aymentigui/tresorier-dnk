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

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  
  try {
    await workbook.xlsx.load(buffer);
  } catch (e) {
    return { error: "Fichier Excel invalide." };
  }

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) return { error: "La feuille de calcul est vide." };

  const fournisseurs = await prisma.fournisseur.findMany({ select: { id: true, nom: true } });
  const fournisseurMap = new Map(fournisseurs.map(f => [f.nom.toLowerCase(), f.id]));

  const validRows: any[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const numeroCheque = row.getCell(1).value?.toString().trim();
    const fournisseurName = row.getCell(2).text?.trim();
    const montantRaw = row.getCell(3).value;
    const rawDateCreation = row.getCell(4).value;
    const rawType = row.getCell(5).text?.trim().toUpperCase();
    const reference = row.getCell(6).text?.trim() || null;
    const rawDateDecaissement = row.getCell(7).value;

    const fournisseurId = fournisseurName ? fournisseurMap.get(fournisseurName.toLowerCase()) : null;

    let dateCreation: Date | null = null;
    if (rawDateCreation instanceof Date) dateCreation = rawDateCreation;
    else if (typeof rawDateCreation === 'string' && !isNaN(new Date(rawDateCreation).getTime())) dateCreation = new Date(rawDateCreation);

    let dateDecaissement: Date | null = null;
    if (rawDateDecaissement instanceof Date) dateDecaissement = rawDateDecaissement;
    else if (typeof rawDateDecaissement === 'string' && rawDateDecaissement.trim() !== '' && !isNaN(new Date(rawDateDecaissement).getTime())) dateDecaissement = new Date(rawDateDecaissement);

    const montant = Number(montantRaw);
    const type: ChequeType = rawType === 'SIMPLE' ? 'SIMPLE' : 'BANQUE'; // Par défaut BANQUE

    if (!numeroCheque) {
      errors.push({ line: rowNumber, message: "Le Numéro du chèque est obligatoire." });
    } else if (!fournisseurName) {
      errors.push({ line: rowNumber, message: "Le nom du fournisseur est obligatoire." });
    } else if (!fournisseurId) {
      errors.push({ line: rowNumber, message: `Fournisseur '${fournisseurName}' introuvable dans la base.` });
    } else if (!dateCreation) {
      errors.push({ line: rowNumber, message: "Date d'émission invalide." });
    } else if (isNaN(montant) || montant <= 0) {
      errors.push({ line: rowNumber, message: "Le montant doit être un nombre positif." });
    } else {
      validRows.push({ numeroCheque, fournisseurId, montant, dateCreation, type, reference, dateDecaissement });
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

  for (const row of validRows) {
    try {
      await prisma.cheque.create({ 
        data: { 
          numeroCheque: row.numeroCheque,
          fournisseurId: row.fournisseurId,
          montant: row.montant,
          dateCreation: new Date(row.dateCreation), 
          type: row.type,
          reference: row.reference,
          dateDecaissement: row.dateDecaissement ? new Date(row.dateDecaissement) : null
        } 
      });
      successCount++;
    } catch (e) {
      dbErrors.push(`Erreur d'insertion pour le chèque N°${row.numeroCheque}.`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'Cheque',
      description: `Import Excel : ${successCount} chèques ajoutés.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/cheques');
  }

  return { successCount, dbErrors };
}