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

  const canExport = await hasPermission('fournisseur:export');
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const where = search ? { nom: { contains: search } } : {};

  const data = await prisma.fournisseur.findMany({ where, orderBy: { createdAt: 'desc' } });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Fournisseurs');

  // Headers
  worksheet.columns = [
    { header: 'Nom du Fournisseur', key: 'nom', width: 40 },
    { header: 'Activité', key: 'activite', width: 30 },
    { header: 'Date de Création', key: 'createdAt', width: 20 },
  ];

  // Styling header
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  // Data
  data.forEach(f => {
    worksheet.addRow({
      nom: f.nom,
      activite: f.activite || '',
      createdAt: f.createdAt.toLocaleDateString('fr-FR'),
    });
  });

  await writeAudit({
    action: 'EXPORT',
    entity: 'Fournisseur',
    description: `Export Excel de ${data.length} fournisseurs`,
    userId: session.userId,
    username: session.username,
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Disposition': 'attachment; filename="export_fournisseurs.xlsx"',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}