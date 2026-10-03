'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { FraisType } from '@prisma/client';

export async function previewExcelImport(formData: FormData) {
  await requirePermission('frais:import');
  
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

  const validRows: { dateCreation: Date; nom: string; type: FraisType; montant: number }[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    let rawDate = row.getCell(1).value;
    const nom = row.getCell(2).text?.trim();
    const rawType = row.getCell(3).text?.trim().toUpperCase();
    const montantRaw = row.getCell(4).value;

    let dateCreation: Date | null = null;
    if (rawDate instanceof Date) {
      dateCreation = rawDate;
    } else if (typeof rawDate === 'string') {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) dateCreation = parsed;
    }

    const type: FraisType | null = rawType === 'TAXE' || rawType === 'TAX' ? 'TAX' : (rawType === 'VIREMENT' ? 'VIREMENT' : null);
    const montant = Number(montantRaw);

    if (!dateCreation) {
      errors.push({ line: rowNumber, message: "Date invalide." });
    } else if (!nom || nom.length < 2) {
      errors.push({ line: rowNumber, message: "Le libellé est obligatoire (min 2 caractères)." });
    } else if (!type) {
      errors.push({ line: rowNumber, message: "Le type doit être 'Taxe' ou 'Virement'." });
    } else if (isNaN(montant) || montant <= 0) {
      errors.push({ line: rowNumber, message: "Le montant doit être un nombre positif." });
    } else {
      validRows.push({ dateCreation, nom, type, montant });
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmImport(validRows: { dateCreation: Date; nom: string; type: FraisType; montant: number }[]) {
  await requirePermission('frais:import');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      await prisma.frais.create({ 
        data: { 
          dateCreation: new Date(row.dateCreation), 
          nom: row.nom, 
          type: row.type, 
          montant: row.montant 
        } 
      });
      successCount++;
    } catch (e) {
      dbErrors.push(`Erreur d'insertion pour "${row.nom}".`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'Frais',
      description: `Import Excel : ${successCount} frais ajoutés.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/frais');
  }

  return { successCount, dbErrors };
}