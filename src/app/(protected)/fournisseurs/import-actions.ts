'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function previewFournisseurImport(formData: FormData) {
  await requirePermission('fournisseur:create');
  
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

  const existingFournisseurs = await prisma.fournisseur.findMany({ select: { nom: true } });
  const existingNames = new Set(existingFournisseurs.map(f => f.nom.toLowerCase().trim()));

  const validRows: { nom: string; activite: string | null; seuilActive: boolean; seuil: number }[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    // Colonnes : Nom | Activité | Seuil Activé (Oui/Non) | Montant Seuil
    const nom = row.getCell(1).text?.trim();
    const activite = row.getCell(2).text?.trim() || null;
    const seuilActiveStr = row.getCell(3).text?.trim().toLowerCase();
    const seuilRaw = row.getCell(4).value;

    const seuilActive = seuilActiveStr === 'oui' || seuilActiveStr === 'vrai' || seuilActiveStr === 'true';
    const seuil = Number(seuilRaw) || 0;

    if (!nom) {
      errors.push({ line: rowNumber, message: "Le Nom du fournisseur est obligatoire." });
    } else if (existingNames.has(nom.toLowerCase())) {
      errors.push({ line: rowNumber, message: `Le fournisseur '${nom}' existe déjà dans la base.` });
    } else if (seuilActive && seuil <= 0) {
      errors.push({ line: rowNumber, message: "Le montant du seuil doit être supérieur à 0 si le seuil est activé." });
    } else {
      validRows.push({ nom, activite, seuilActive, seuil });
      existingNames.add(nom.toLowerCase()); // لمنع التكرار داخل نفس ملف الإكسيل
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmFournisseurImport(validRows: { nom: string; activite: string | null; seuilActive: boolean; seuil: number }[]) {
  await requirePermission('fournisseur:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      await prisma.fournisseur.create({ 
        data: { 
          nom: row.nom,
          activite: row.activite,
          seuilActive: row.seuilActive,
          seuil: row.seuilActive ? row.seuil : null,
          cumulMontant: 0 // يبدأ دائما بـ 0
        } 
      });
      successCount++;
    } catch (e) {
      dbErrors.push(`Erreur pour le fournisseur '${row.nom}'.`);
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