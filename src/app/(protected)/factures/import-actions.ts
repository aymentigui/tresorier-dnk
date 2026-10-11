'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function previewFactureImport(formData: FormData) {
  await requirePermission('facture:create'); 
  
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

  // جلب البيانات للمقارنة
  const fournisseurs = await prisma.fournisseur.findMany({ select: { id: true, nom: true } });
  const fournisseurMap = new Map(fournisseurs.map(f => [f.nom.toLowerCase().trim(), f.id]));

  const bcs = await prisma.bonCommande.findMany({ select: { id: true, numero: true, fournisseurId: true } });
  const contrats = await prisma.contrat.findMany({ select: { id: true, numero: true, fournisseurId: true } });

  // 💡 الحماية ضد التكرار: جلب الفواتير الموجودة مسبقاً
  const facturesExistantes = await prisma.facture.findMany({ select: { numero: true } });
  const existingNumeros = new Set(facturesExistantes.map(f => f.numero.toLowerCase().trim()));

  const validRows: any[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    // N° Facture | Fournisseur | Date | Montant | Désignation (Opt) | Description (Opt) | Type Rattachement (BC/CONTRAT/AUCUN) | N° Rattachement
    const numero = row.getCell(1).value?.toString().trim();
    const fournisseurName = row.getCell(2).text?.trim();
    const rawDate = row.getCell(3).value;
    const montantRaw = row.getCell(4).value;
    const designation = row.getCell(5).text?.trim() || null;
    const description = row.getCell(6).text?.trim() || null;
    const rawTypeRattach = row.getCell(7).text?.trim().toUpperCase();
    const numeroRattach = row.getCell(8).text?.trim();

    const fournisseurId = fournisseurName ? fournisseurMap.get(fournisseurName.toLowerCase()) : null;

    let bonCommandeId = null;
    let contratId = null;

    if (fournisseurId && rawTypeRattach && numeroRattach) {
      if (rawTypeRattach === 'BC') {
        const bc = bcs.find(b => b.numero.toLowerCase().trim() === numeroRattach.toLowerCase() && b.fournisseurId === fournisseurId);
        if (bc) bonCommandeId = bc.id;
        else errors.push({ line: rowNumber, message: `Le BC '${numeroRattach}' n'existe pas ou n'appartient pas à '${fournisseurName}'.` });
      } else if (rawTypeRattach === 'CONTRAT') {
        const c = contrats.find(c => c.numero.toLowerCase().trim() === numeroRattach.toLowerCase() && c.fournisseurId === fournisseurId);
        if (c) contratId = c.id;
        else errors.push({ line: rowNumber, message: `Le Contrat '${numeroRattach}' n'existe pas ou n'appartient pas à '${fournisseurName}'.` });
      }
    }

    let dateCreation: Date | null = null;
    if (rawDate instanceof Date) dateCreation = rawDate;
    else if (typeof rawDate === 'string' && !isNaN(new Date(rawDate).getTime())) dateCreation = new Date(rawDate);

    const montant = Number(montantRaw);

    if (!numero) {
      errors.push({ line: rowNumber, message: "Le Numéro de facture est obligatoire." });
    } else if (existingNumeros.has(numero.toLowerCase())) {
      // 💡 تنبيه المستخدم في حالة التكرار
      errors.push({ line: rowNumber, message: `La Facture N° '${numero}' existe déjà.` });
    } else if (!fournisseurName) {
      errors.push({ line: rowNumber, message: "Le nom du fournisseur est obligatoire." });
    } else if (!fournisseurId) {
      errors.push({ line: rowNumber, message: `Fournisseur '${fournisseurName}' introuvable dans la base.` });
    } else if (!dateCreation) {
      errors.push({ line: rowNumber, message: "Date invalide." });
    } else if (isNaN(montant) || montant <= 0) {
      errors.push({ line: rowNumber, message: "Le montant doit être un nombre positif." });
    } else if (!errors.some(e => e.line === rowNumber)) {
      validRows.push({ numero, fournisseurId, date: dateCreation, montant, designation, description, bonCommandeId, contratId });
      existingNumeros.add(numero.toLowerCase()); // 💡 منع التكرار داخل نفس ملف الإكسيل
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmFactureImport(validRows: any[]) {
  await requirePermission('facture:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      await prisma.facture.create({ 
        data: { 
          numero: row.numero,
          fournisseurId: row.fournisseurId,
          date: new Date(row.date),
          montant: row.montant,
          designation: row.designation,
          description: row.description,
          bonCommandeId: row.bonCommandeId,
          contratId: row.contratId,
          statut: 'EN_ATTENTE',
          pourcentage: 0
        } 
      });
      successCount++;
    } catch (e) {
      dbErrors.push(`Erreur d&aposinsertion pour la facture N°${row.numero}.`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'Facture',
      description: `Import Excel : ${successCount} factures ajoutées.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/factures');
  }

  return { successCount, dbErrors };
}