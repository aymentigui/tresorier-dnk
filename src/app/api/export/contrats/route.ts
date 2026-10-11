import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { hasPermission } from '@/lib/permissions';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);
  if (!session) return new NextResponse('Non autorisé', { status: 401 });

  const canExport = await hasPermission('contrat:view'); 
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const where: any = {};
  
  if (url.searchParams.get('search')) where.numero = { contains: url.searchParams.get('search') };
  if (url.searchParams.get('fournisseurId')) where.fournisseurId = url.searchParams.get('fournisseurId');
  if (url.searchParams.get('statut') === 'ACTIF') where.isActive = true;
  else if (url.searchParams.get('statut') === 'ARCHIVE') where.isActive = false;

  const dateDebutMin = url.searchParams.get('dateDebutMin');
  const dateDebutMax = url.searchParams.get('dateDebutMax');
  if (dateDebutMin || dateDebutMax) {
    where.date = {};
    if (dateDebutMin) where.date.gte = new Date(dateDebutMin);
    if (dateDebutMax) where.date.lte = new Date(dateDebutMax);
  }

  const dateFinMin = url.searchParams.get('dateFinMin');
  const dateFinMax = url.searchParams.get('dateFinMax');
  if (dateFinMin || dateFinMax) {
    where.dateFin = {};
    if (dateFinMin) where.dateFin.gte = new Date(dateFinMin);
    if (dateFinMax) where.dateFin.lte = new Date(dateFinMax);
  }

  const montantMin = url.searchParams.get('montantMin');
  const montantMax = url.searchParams.get('montantMax');
  if (montantMin || montantMax) {
    where.montant = {};
    if (montantMin) where.montant.gte = Number(montantMin);
    if (montantMax) where.montant.lte = Number(montantMax);
  }

  const data = await prisma.contrat.findMany({ 
    where, 
    include: { 
        fournisseur: { select: { nom: true } },
        parent: { select: { numero: true } },
        factures: { include: { cheques: { where: { statut: { not: 'ANNULE' } } } } }
    },
    orderBy: { createdAt: 'desc' } 
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Contrats_Data');

  worksheet.columns = [
    { header: 'N° Contrat', key: 'numero', width: 20 },
    { header: 'Fournisseur', key: 'fournisseur', width: 30 },
    { header: 'Date Début', key: 'date', width: 15 },
    { header: 'Date Fin', key: 'dateFin', width: 15 },
    { header: 'Montant (DA)', key: 'montant', width: 20 },
    { header: 'Montant Payé (DA)', key: 'paye', width: 20 },
    { header: 'Seuil (DA)', key: 'seuil', width: 20 },
    { header: 'Alerte Seuil (%)', key: 'pctSeuil', width: 15 },
    { header: 'Statut', key: 'statut', width: 15 },
    { header: 'Origine (Renouvelé de)', key: 'parent', width: 20 },
    { header: 'Désignation', key: 'designation', width: 40 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo

  data.forEach(c => {
    let totalPaye = 0;
    c.factures.forEach(f => f.cheques.forEach(chq => totalPaye += Number(chq.montant)));
    
    const seuil = Number(c.seuil);
    const pctSeuil = c.seuilActive && seuil > 0 ? (totalPaye / seuil) * 100 : 0;

    worksheet.addRow({
      numero: c.numero,
      fournisseur: c.fournisseur.nom,
      date: c.date.toLocaleDateString('fr-FR'),
      dateFin: c.dateFin ? c.dateFin.toLocaleDateString('fr-FR') : '-',
      montant: Number(c.montant),
      paye: totalPaye,
      seuil: c.seuilActive ? seuil : '-',
      pctSeuil: c.seuilActive ? Number(pctSeuil.toFixed(2)) : '-',
      statut: c.isActive ? 'Actif' : 'Archivé/Renouvelé',
      parent: c.parent ? c.parent.numero : '-',
      designation: c.designation || '-',
    });
  });

  await writeAudit({ action: 'EXPORT', entity: 'Contrat', description: `Export Excel avancé de ${data.length} contrats`, userId: session.userId, username: session.username });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: { 'Content-Disposition': 'attachment; filename="rapport_contrats_complet.xlsx"', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
}