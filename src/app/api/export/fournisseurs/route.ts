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

  const canExport = await hasPermission('fournisseur:view');
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const activite = url.searchParams.get('activite') || '';
  const alerteSeuil = url.searchParams.get('alerteSeuil') || '';

  const where: any = {};
  if (search) where.nom = { contains: search };
  if (activite) where.activite = { contains: activite };

  const allFournisseurs = await prisma.fournisseur.findMany({ 
    where,
    orderBy: { nom: 'asc' } 
  });

  let data = allFournisseurs;
  if (alerteSeuil === 'critique') {
    data = allFournisseurs.filter(f => f.seuilActive && f.seuil && (Number(f.cumulMontant) / Number(f.seuil)) >= 0.9);
  } else if (alerteSeuil === 'normal') {
    data = allFournisseurs.filter(f => !f.seuilActive || (f.seuilActive && f.seuil && (Number(f.cumulMontant) / Number(f.seuil)) < 0.9));
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Fournisseurs_Data');

  worksheet.columns = [
    { header: 'Fournisseur / Raison Sociale', key: 'nom', width: 35 },
    { header: 'Activité', key: 'activite', width: 30 },
    { header: 'Cumul Payé (DA)', key: 'cumul', width: 20 },
    { header: 'Seuil Activé', key: 'seuilActive', width: 15 },
    { header: 'Montant Seuil (DA)', key: 'seuil', width: 20 },
    { header: 'Consommation Seuil (%)', key: 'pct', width: 25 },
    { header: 'État (Alerte)', key: 'etat', width: 25 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  data.forEach(f => {
    const seuil = Number(f.seuil || 0);
    const cumul = Number(f.cumulMontant);
    const pct = f.seuilActive && seuil > 0 ? (cumul / seuil) * 100 : 0;
    const isAlert = pct >= 90;

    worksheet.addRow({
      nom: f.nom,
      activite: f.activite || '-',
      cumul: cumul,
      seuilActive: f.seuilActive ? 'Oui' : 'Non',
      seuil: f.seuilActive ? seuil : '-',
      pct: f.seuilActive ? `${pct.toFixed(2)}%` : '-',
      etat: !f.seuilActive ? 'Pas de seuil' : (isAlert ? 'CRITIQUE (>= 90%)' : 'Normal'),
    });
  });

  await writeAudit({ action: 'EXPORT', entity: 'Fournisseur', description: `Export Excel de ${data.length} fournisseurs`, userId: session.userId, username: session.username });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: { 'Content-Disposition': 'attachment; filename="rapport_fournisseurs_complet.xlsx"', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
}