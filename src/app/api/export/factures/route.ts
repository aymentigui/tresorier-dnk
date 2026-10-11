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

  const canExport = await hasPermission('facture:view'); // Utilise la permission de vue pour l&aposexport (ou export si elle existe)
  if (!canExport) return new NextResponse('Accès refusé', { status: 403 });

  const url = new URL(req.url);
  const where: any = {};
  
  if (url.searchParams.get('search')) where.numero = { contains: url.searchParams.get('search') };
  if (url.searchParams.get('fournisseurId')) where.fournisseurId = url.searchParams.get('fournisseurId');
  if (url.searchParams.get('statut')) where.statut = url.searchParams.get('statut');
  
  const rattachement = url.searchParams.get('rattachement');
  if (rattachement === 'BC') where.bonCommandeId = { not: null };
  else if (rattachement === 'CONTRAT') where.contratId = { not: null };
  else if (rattachement === 'AUCUN') { where.bonCommandeId = null; where.contratId = null; }

  if (url.searchParams.get('bonCommandeId')) where.bonCommandeId = url.searchParams.get('bonCommandeId');
  if (url.searchParams.get('contratId')) where.contratId = url.searchParams.get('contratId');

  const dateDebut = url.searchParams.get('dateDebut');
  const dateFin = url.searchParams.get('dateFin');
  if (dateDebut || dateFin) {
    where.date = {};
    if (dateDebut) where.date.gte = new Date(dateDebut);
    if (dateFin) where.date.lte = new Date(dateFin);
  }

  const montantMin = url.searchParams.get('montantMin');
  const montantMax = url.searchParams.get('montantMax');
  if (montantMin || montantMax) {
    where.montant = {};
    if (montantMin) where.montant.gte = Number(montantMin);
    if (montantMax) where.montant.lte = Number(montantMax);
  }

  const data = await prisma.facture.findMany({ 
    where, 
    include: { 
        fournisseur: { select: { nom: true } },
        bonCommande: { select: { numero: true } },
        contrat: { select: { numero: true } },
        cheques: { where: { statut: { not: 'ANNULE' } }, select: { montant: true } }
    },
    orderBy: { date: 'desc' } 
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Factures_Data');

  worksheet.columns = [
    { header: 'N° Facture', key: 'numero', width: 20 },
    { header: 'Fournisseur', key: 'fournisseur', width: 30 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Montant Total (DA)', key: 'montant', width: 20 },
    { header: 'Montant Payé (DA)', key: 'paye', width: 20 },
    { header: 'Reste à Payer (DA)', key: 'reste', width: 20 },
    { header: 'Statut', key: 'statut', width: 25 },
    { header: 'Avancement (%)', key: 'pourcentage', width: 15 },
    { header: 'Origine', key: 'origine', width: 25 },
    { header: 'Désignation', key: 'designation', width: 30 },
    { header: 'Description', key: 'description', width: 40 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  data.forEach(f => {
    let origine = 'Indépendante';
    if (f.bonCommande) origine = `bonCommande: ${f.bonCommande.numero}`;
    else if (f.contrat) origine = `Contrat: ${f.contrat.numero}`;

    const totalPaye = f.cheques.reduce((sum, c) => sum + Number(c.montant), 0);
    const reste = Number(f.montant) - totalPaye;

    worksheet.addRow({
      numero: f.numero,
      fournisseur: f.fournisseur.nom,
      date: f.date.toLocaleDateString('fr-FR'),
      montant: Number(f.montant),
      paye: totalPaye,
      reste: Math.max(0, reste),
      statut: f.statut.replace('_', ' '),
      pourcentage: Number(f.pourcentage),
      origine: origine,
      designation: f.designation || '-',
      description: f.description || '-',
    });
  });

  await writeAudit({ action: 'EXPORT', entity: 'Facture', description: `Export Excel avancé de ${data.length} factures`, userId: session.userId, username: session.username });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: { 'Content-Disposition': 'attachment; filename="rapport_factures_complet.xlsx"', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
}