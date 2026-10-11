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

  const canExport = await hasPermission('bonCommande:view');
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const where: any = {};
  
  if (url.searchParams.get('search')) where.numero = { contains: url.searchParams.get('search') };
  if (url.searchParams.get('fournisseurId')) where.fournisseurId = url.searchParams.get('fournisseurId');

  const dateDebutMin = url.searchParams.get('dateDebutMin');
  const dateDebutMax = url.searchParams.get('dateDebutMax');
  if (dateDebutMin || dateDebutMax) {
    where.date = {};
    if (dateDebutMin) where.date.gte = new Date(dateDebutMin);
    if (dateDebutMax) where.date.lte = new Date(dateDebutMax);
  }

  const montantMin = url.searchParams.get('montantMin');
  const montantMax = url.searchParams.get('montantMax');
  if (montantMin || montantMax) {
    where.montant = {};
    if (montantMin) where.montant.gte = Number(montantMin);
    if (montantMax) where.montant.lte = Number(montantMax);
  }

  const data = await prisma.bonCommande.findMany({ 
    where, 
    include: { 
        fournisseur: { select: { nom: true } },
        _count: { select: { factures: true } }
    },
    orderBy: { date: 'desc' } 
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('BC_Data');

  worksheet.columns = [
    { header: 'N° Bon de Commande', key: 'numero', width: 25 },
    { header: 'Fournisseur', key: 'fournisseur', width: 30 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Montant (DA)', key: 'montant', width: 20 },
    { header: 'Désignation', key: 'designation', width: 40 },
    { header: 'Nombre de Factures Liées', key: 'factures', width: 25 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  data.forEach(bc => {
    worksheet.addRow({
      numero: bc.numero,
      fournisseur: bc.fournisseur.nom,
      date: bc.date.toLocaleDateString('fr-FR'),
      montant: Number(bc.montant),
      designation: bc.designation || '-',
      factures: bc._count.factures,
    });
  });

  await writeAudit({ action: 'EXPORT', entity: 'BonCommande', description: `Export Excel avancé de ${data.length} BC`, userId: session.userId, username: session.username });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: { 'Content-Disposition': 'attachment; filename="rapport_bc_complet.xlsx"', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
}