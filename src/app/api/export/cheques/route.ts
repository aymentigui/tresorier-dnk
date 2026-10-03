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

  const canExport = await hasPermission('cheque:export');
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const fournisseurId = url.searchParams.get('fournisseurId') || '';
  const statut = url.searchParams.get('statut') || '';

  const where: any = {};
  if (search) where.numeroCheque = { contains: search };
  if (fournisseurId) where.fournisseurId = fournisseurId;
  if (statut === 'en_circulation') where.dateDecaissement = null;
  else if (statut === 'decaisse') where.dateDecaissement = { not: null };

  const data = await prisma.cheque.findMany({ 
    where, 
    include: { fournisseur: { select: { nom: true } } },
    orderBy: { dateCreation: 'desc' } 
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Chèques');

  worksheet.columns = [
    { header: 'N° Chèque', key: 'numeroCheque', width: 20 },
    { header: 'Fournisseur', key: 'fournisseur', width: 30 },
    { header: 'Montant (DA)', key: 'montant', width: 20 },
    { header: 'Date d\'émission', key: 'dateCreation', width: 15 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Référence', key: 'reference', width: 20 },
    { header: 'Statut', key: 'statut', width: 20 },
    { header: 'Date d\'encaissement', key: 'dateDecaissement', width: 20 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  data.forEach(c => {
    worksheet.addRow({
      numeroCheque: c.numeroCheque,
      fournisseur: c.fournisseur.nom,
      montant: Number(c.montant),
      dateCreation: c.dateCreation.toLocaleDateString('fr-FR'),
      type: c.type === 'BANQUE' ? 'Banque' : 'Simple',
      reference: c.reference || '-',
      statut: c.dateDecaissement ? 'Décaissé' : 'En circulation',
      dateDecaissement: c.dateDecaissement ? c.dateDecaissement.toLocaleDateString('fr-FR') : '-',
    });
  });

  await writeAudit({
    action: 'EXPORT',
    entity: 'Cheque',
    description: `Export Excel de ${data.length} chèques`,
    userId: session.userId,
    username: session.username,
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Disposition': 'attachment; filename="export_cheques.xlsx"',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}