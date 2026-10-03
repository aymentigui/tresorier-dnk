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

  const canExport = await hasPermission('encaissement:export');
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId') || '';
  const statut = url.searchParams.get('statut') || '';

  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (statut === 'en_circulation') where.dateEncaissement = null;
  else if (statut === 'encaisse') where.dateEncaissement = { not: null };

  const data = await prisma.encaissement.findMany({ 
    where, 
    include: { client: { select: { nom: true } } },
    orderBy: { dateCreation: 'desc' } 
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Encaissements');

  // Headers
  worksheet.columns = [
    { header: 'Client', key: 'client', width: 30 },
    { header: 'Date Prévue', key: 'dateCreation', width: 15 },
    { header: 'Montant (DA)', key: 'montant', width: 20 },
    { header: 'Statut', key: 'statut', width: 20 },
    { header: 'Date d\'encaissement', key: 'dateEncaissement', width: 20 },
  ];

  // Styling header
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  // Data
  data.forEach(e => {
    worksheet.addRow({
      client: e.client.nom,
      dateCreation: e.dateCreation.toLocaleDateString('fr-FR'),
      montant: Number(e.montant),
      statut: e.dateEncaissement ? 'Encaissé' : 'En attente',
      dateEncaissement: e.dateEncaissement ? e.dateEncaissement.toLocaleDateString('fr-FR') : '-',
    });
  });

  await writeAudit({
    action: 'EXPORT',
    entity: 'Encaissement',
    description: `Export Excel de ${data.length} encaissements`,
    userId: session.userId,
    username: session.username,
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Disposition': 'attachment; filename="export_encaissements.xlsx"',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}