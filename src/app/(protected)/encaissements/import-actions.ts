'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function previewExcelImport(formData: FormData) {
  await requirePermission('encaissement:import');
  
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

  // نجيبو كامل العملاء باش نفيريفيو إذا العميل موجود في القاعدة
  const clients = await prisma.client.findMany({ select: { id: true, nom: true } });
  const clientMap = new Map(clients.map(c => [c.nom.toLowerCase(), c.id]));

  const validRows: { clientId: string; clientName: string; montant: number; dateCreation: Date; dateEncaissement: Date | null }[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const clientName = row.getCell(1).text?.trim();
    let rawDateCreation = row.getCell(2).value;
    const montantRaw = row.getCell(3).value;
    let rawDateEncaissement = row.getCell(4).value;

    // Validation Client
    const clientId = clientName ? clientMap.get(clientName.toLowerCase()) : null;

    // Validation Date Création
    let dateCreation: Date | null = null;
    if (rawDateCreation instanceof Date) dateCreation = rawDateCreation;
    else if (typeof rawDateCreation === 'string' && !isNaN(new Date(rawDateCreation).getTime())) dateCreation = new Date(rawDateCreation);

    // Validation Date Encaissement (Optionnelle)
    let dateEncaissement: Date | null = null;
    if (rawDateEncaissement instanceof Date) dateEncaissement = rawDateEncaissement;
    else if (typeof rawDateEncaissement === 'string' && rawDateEncaissement.trim() !== '' && !isNaN(new Date(rawDateEncaissement).getTime())) dateEncaissement = new Date(rawDateEncaissement);

    const montant = Number(montantRaw);

    if (!clientName) {
      errors.push({ line: rowNumber, message: "Le nom du client est obligatoire." });
    } else if (!clientId) {
      errors.push({ line: rowNumber, message: `Client '${clientName}' introuvable dans la base de données.` });
    } else if (!dateCreation) {
      errors.push({ line: rowNumber, message: "Date prévue invalide." });
    } else if (isNaN(montant) || montant <= 0) {
      errors.push({ line: rowNumber, message: "Le montant doit être un nombre positif." });
    } else {
      validRows.push({ clientId, clientName, montant, dateCreation, dateEncaissement });
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmImport(validRows: { clientId: string; montant: number; dateCreation: Date; dateEncaissement: Date | null }[]) {
  await requirePermission('encaissement:import');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      await prisma.encaissement.create({ 
        data: { 
          clientId: row.clientId,
          montant: row.montant,
          dateCreation: new Date(row.dateCreation), 
          dateEncaissement: row.dateEncaissement ? new Date(row.dateEncaissement) : null
        } 
      });
      successCount++;
    } catch (e) {
      dbErrors.push(`Erreur d&aposinsertion pour l&aposencaissement de ${row.montant} DA.`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'Encaissement',
      description: `Import Excel : ${successCount} encaissements ajoutés.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/encaissements');
  }

  return { successCount, dbErrors };
}