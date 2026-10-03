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

  const canExport = await hasPermission('client:export');
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const where = search ? { nom: { contains: search } } : {};

  const data = await prisma.client.findMany({ where, orderBy: { createdAt: 'desc' } });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Clients');

  // Headers
  worksheet.columns = [
    { header: 'Nom du Client', key: 'nom', width: 40 },
    { header: 'Date de Création', key: 'createdAt', width: 20 },
  ];

  // Styling header
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  // Data
  data.forEach(c => {
    worksheet.addRow({
      nom: c.nom,
      createdAt: c.createdAt.toLocaleDateString('fr-FR'),
    });
  });

  await writeAudit({
    action: 'EXPORT',
    entity: 'Client',
    description: `Export Excel de ${data.length} clients`,
    userId: session.userId,
    username: session.username,
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Disposition': 'attachment; filename="export_clients.xlsx"',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}