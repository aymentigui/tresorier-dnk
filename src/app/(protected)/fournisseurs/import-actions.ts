'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

// 1. Validation w Preview ta3 le fichier
export async function previewExcelImport(formData: FormData) {
  await requirePermission('fournisseur:import');
  
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

  const validRows: { nom: string; activite: string }[] = [];
  const errors: { line: number; message: string }[] = [];

  // L'itération tbda men la ligne 2 (la ligne 1 hiya les titres)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const nom = row.getCell(1).text?.trim();
    const activite = row.getCell(2).text?.trim() || '';

    if (!nom) {
      errors.push({ line: rowNumber, message: "Le nom est obligatoire." });
    } else if (nom.length < 2) {
      errors.push({ line: rowNumber, message: "Le nom est trop court." });
    } else {
      validRows.push({ nom, activite });
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

// 2. L'importation finale f la Base de données
export async function confirmImport(validRows: { nom: string; activite: string }[]) {
  await requirePermission('fournisseur:import');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      const exists = await prisma.fournisseur.findUnique({ where: { nom: row.nom } });
      if (!exists) {
        await prisma.fournisseur.create({ data: { nom: row.nom, activite: row.activite } });
        successCount++;
      } else {
        dbErrors.push(`Le fournisseur "${row.nom}" existe déjà.`);
      }
    } catch (e) {
      dbErrors.push(`Erreur d'insertion pour "${row.nom}".`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'Fournisseur',
      description: `Import Excel : ${successCount} fournisseurs ajoutés.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/fournisseurs');
  }

  return { successCount, dbErrors };
}