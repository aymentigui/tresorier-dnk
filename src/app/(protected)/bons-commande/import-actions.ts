'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function previewBcImport(formData: FormData) {
  await requirePermission('bonCommande:create');
  
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

  const fournisseurs = await prisma.fournisseur.findMany({ select: { id: true, nom: true } });
  const fournisseurMap = new Map(fournisseurs.map(f => [f.nom.toLowerCase().trim(), f.id]));

  // 💡 الحماية ضد التكرار: جلب BC الموجودين مسبقاً
  const bcsExistants = await prisma.bonCommande.findMany({ select: { numero: true } });
  const existingNumeros = new Set(bcsExistants.map(bc => bc.numero.toLowerCase().trim()));

  const validRows: any[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    // N° BC | Fournisseur | Date | Montant | Désignation
    const numero = row.getCell(1).value?.toString().trim();
    const fournisseurName = row.getCell(2).text?.trim();
    const rawDate = row.getCell(3).value;
    const montantRaw = row.getCell(4).value;
    const designation = row.getCell(5).text?.trim() || null;

    const fournisseurId = fournisseurName ? fournisseurMap.get(fournisseurName.toLowerCase()) : null;

    let dateCreation: Date | null = null;
    if (rawDate instanceof Date) dateCreation = rawDate;
    else if (typeof rawDate === 'string' && !isNaN(new Date(rawDate).getTime())) dateCreation = new Date(rawDate);

    const montant = Number(montantRaw);

    if (!numero) {
      errors.push({ line: rowNumber, message: "Le Numéro du BC est obligatoire." });
    } else if (existingNumeros.has(numero.toLowerCase())) {
      // 💡 تنبيه المستخدم في حالة التكرار
      errors.push({ line: rowNumber, message: `Le BC N° '${numero}' existe déjà.` });
    } else if (!fournisseurName) {
      errors.push({ line: rowNumber, message: "Le nom du fournisseur est obligatoire." });
    } else if (!fournisseurId) {
      errors.push({ line: rowNumber, message: `Fournisseur '${fournisseurName}' introuvable dans la base.` });
    } else if (!dateCreation) {
      errors.push({ line: rowNumber, message: "Date invalide." });
    } else if (isNaN(montant) || montant <= 0) {
      errors.push({ line: rowNumber, message: "Le montant doit être un nombre positif." });
    } else {
      validRows.push({ numero, fournisseurId, date: dateCreation, montant, designation });
      existingNumeros.add(numero.toLowerCase()); // 💡 منع التكرار داخل نفس ملف الإكسيل
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmBcImport(validRows: any[]) {
  await requirePermission('bonCommande:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      await prisma.bonCommande.create({ 
        data: { 
          numero: row.numero,
          fournisseurId: row.fournisseurId,
          date: new Date(row.date),
          montant: row.montant,
          designation: row.designation
        } 
      });
      successCount++;
    } catch (e) {
      dbErrors.push(`Erreur pour le BC N°${row.numero} (Il existe peut-être déjà).`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'BonCommande',
      description: `Import Excel : ${successCount} BC ajoutés.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/bons-commande');
  }

  return { successCount, dbErrors };
}