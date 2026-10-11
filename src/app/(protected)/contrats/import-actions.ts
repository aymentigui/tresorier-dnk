'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function previewContratImport(formData: FormData) {
  await requirePermission('contrat:create');
  
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

  // نجيبو الموردين الموجودين باش نفيريفيو
  const fournisseursDB = await prisma.fournisseur.findMany({ select: { id: true, nom: true } });
  const fournisseursMap = new Map(fournisseursDB.map(f => [f.nom.toLowerCase().trim(), f.id]));

  // نجيبو العقود لتفادي التكرار
  const contratsDB = await prisma.contrat.findMany({ select: { numero: true } });
  const existingNumeros = new Set(contratsDB.map(c => c.numero.toLowerCase().trim()));

  const validRows: any[] = [];
  const errors: { line: number; message: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // تجاوز سطر العناوين
    
    // Colonnes : 1:Num | 2:Fournisseur | 3:Date | 4:DateFin | 5:Montant | 6:Consommé Initial | 7:Désignation | 8:Seuil(Oui/Non) | 9:Montant Seuil
    const numero = row.getCell(1).text?.trim();
    const nomFournisseur = row.getCell(2).text?.trim();
    
    const dateRaw = row.getCell(3).value;
    const dateFinRaw = row.getCell(4).value;
    
    const montant = Number(row.getCell(5).value) || 0;
    const consommeInitial = Number(row.getCell(6).value) || 0; // 💡 الحقل الجديد
    const designation = row.getCell(7).text?.trim() || null;
    
    const seuilActiveStr = row.getCell(8).text?.trim().toLowerCase();
    const seuilActive = seuilActiveStr === 'oui' || seuilActiveStr === 'vrai' || seuilActiveStr === 'true';
    const seuil = Number(row.getCell(9).value) || 0;

    let dateValid = null;
    if (dateRaw instanceof Date) dateValid = dateRaw;
    else if (typeof dateRaw === 'string') dateValid = new Date(dateRaw);

    let dateFinValid = null;
    if (dateFinRaw instanceof Date) dateFinValid = dateFinRaw;
    else if (typeof dateFinRaw === 'string') dateFinValid = new Date(dateFinRaw);

    if (!numero) {
      errors.push({ line: rowNumber, message: "Le numéro du contrat est obligatoire." });
    } else if (existingNumeros.has(numero.toLowerCase())) {
      errors.push({ line: rowNumber, message: `Le contrat N° '${numero}' existe déjà.` });
    } else if (!nomFournisseur || !fournisseursMap.has(nomFournisseur.toLowerCase())) {
      errors.push({ line: rowNumber, message: `Le fournisseur '${nomFournisseur}' est introuvable dans la base.` });
    } else if (!dateValid || isNaN(dateValid.getTime())) {
      errors.push({ line: rowNumber, message: "La date de début est invalide ou manquante." });
    } else if (montant <= 0) {
      errors.push({ line: rowNumber, message: "Le montant doit être supérieur à 0." });
    } else if (consommeInitial > montant) {
      errors.push({ line: rowNumber, message: "La consommation initiale ne peut pas dépasser le montant du contrat." });
    } else if (seuilActive && seuil > montant) {
      errors.push({ line: rowNumber, message: "Le seuil ne peut pas dépasser le montant du contrat." });
    } else {
      validRows.push({
        numero,
        fournisseurId: fournisseursMap.get(nomFournisseur.toLowerCase()),
        date: dateValid,
        dateFin: dateFinValid && !isNaN(dateFinValid.getTime()) ? dateFinValid : null,
        montant,
        montantConsommeInitial: consommeInitial,
        designation,
        seuilActive,
        seuil: seuilActive ? seuil : null
      });
      existingNumeros.add(numero.toLowerCase()); // منع التكرار داخل نفس الملف
    }
  });

  return { validRows, errors, total: validRows.length + errors.length };
}

export async function confirmContratImport(validRows: any[]) {
  await requirePermission('contrat:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  let successCount = 0;
  const dbErrors: string[] = [];

  for (const row of validRows) {
    try {
      await prisma.contrat.create({ 
        data: { 
          numero: row.numero,
          fournisseurId: row.fournisseurId,
          date: row.date,
          dateFin: row.dateFin,
          montant: row.montant,
          montantConsommeInitial: row.montantConsommeInitial,
          designation: row.designation,
          seuilActive: row.seuilActive,
          seuil: row.seuil,
          isActive: true
        } 
      });
      successCount++;
    } catch (e) {
      dbErrors.push(`Erreur pour le contrat '${row.numero}'.`);
    }
  }

  if (successCount > 0) {
    await writeAudit({
      action: 'IMPORT',
      entity: 'Contrat',
      description: `Import Excel : ${successCount} contrats ajoutés.`,
      userId: session?.userId,
      username: session?.username,
    });
    revalidatePath('/contrats');
  }

  return { successCount, dbErrors };
}