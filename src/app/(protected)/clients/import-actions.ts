'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function previewExcelImport(formData: FormData) {
  await requirePermission('client:import');
  
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

  const validRows: { nom: string }[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; 
    
    const nom = row.getCell(1).text?.trim();

    if (!nom) {
      errors.push({ line: rowNumber, message: "Le nom est obligatoire." });
    } else if (nom.length < 2) {
      errors.push({ line: rowNumber, message: "Le nom est trop court." });
    } else {
      validRows.push({ nom });
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmImport(validRows: { nom: string }[]) {
  await requirePermission('client:import');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      const exists = await prisma.client.findUnique({ where: { nom: row.nom } });
      if (!exists) {
        await prisma.client.create({ data: { nom: row.nom } });
        successCount++;
      } else {
        dbErrors.push(`Le client "${row.nom}" existe déjà.`);
      }
    } catch (e) {
      dbErrors.push(`Erreur d&aposinsertion pour "${row.nom}".`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'Client',
      description: `Import Excel : ${successCount} clients ajoutés.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/clients');
  }

  return { successCount, dbErrors };
}