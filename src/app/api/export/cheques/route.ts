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
  const dateEmissionDebut = url.searchParams.get('dateEmissionDebut') || '';
  const dateEmissionFin = url.searchParams.get('dateEmissionFin') || '';
  const dateEncaissementDebut = url.searchParams.get('dateEncaissementDebut') || '';
  const dateEncaissementFin = url.searchParams.get('dateEncaissementFin') || '';
  const montantMin = url.searchParams.get('montantMin') || '';
  const montantMax = url.searchParams.get('montantMax') || '';
  const factureId = url.searchParams.get('factureId') || '';
  const contratId = url.searchParams.get('contratId') || '';

  const where: any = {};
  if (search) where.numeroCheque = { contains: search };
  if (fournisseurId) where.fournisseurId = fournisseurId;
  if (factureId) where.factureId = factureId;
  if (contratId) where.facture = { contratId };
  
  if (statut) {
    if (statut === 'annule') where.statut = 'ANNULE';
    else if (statut === 'en_circulation') where.statut = 'EN_CIRCULATION';
    else if (statut === 'decaisse') where.statut = 'DECAISSE';
  }
  if (dateEmissionDebut || dateEmissionFin) {
    where.dateCreation = {};
    if (dateEmissionDebut) where.dateCreation.gte = new Date(dateEmissionDebut);
    if (dateEmissionFin) where.dateCreation.lte = new Date(dateEmissionFin);
  }
  if (dateEncaissementDebut || dateEncaissementFin) {
    where.dateDecaissement = {};
    if (dateEncaissementDebut) where.dateDecaissement.gte = new Date(dateEncaissementDebut);
    if (dateEncaissementFin) where.dateDecaissement.lte = new Date(dateEncaissementFin);
  }
  if (montantMin || montantMax) {
    where.montant = {};
    if (montantMin) where.montant.gte = Number(montantMin);
    if (montantMax) where.montant.lte = Number(montantMax);
  }

  const data = await prisma.cheque.findMany({ 
    where, 
    include: { 
        fournisseur: { select: { nom: true } },
        facture: { include: { bonCommande: { select: { numero: true } }, contrat: { select: { numero: true } } } }
    },
    orderBy: { dateCreation: 'desc' } 
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Chèques_Data');

  worksheet.columns = [
    { header: 'N° Chèque', key: 'numeroCheque', width: 15 },
    { header: 'Fournisseur', key: 'fournisseur', width: 30 },
    { header: 'Montant (DA)', key: 'montant', width: 20 },
    { header: 'Date d\'émission', key: 'dateCreation', width: 15 },
    { header: 'Statut Chèque', key: 'statut', width: 20 },
    { header: 'Date d\'encaissement', key: 'dateDecaissement', width: 20 },
    { header: 'Date d\'annulation', key: 'dateAnnulation', width: 20 },
    { header: 'N° Facture', key: 'numeroFacture', width: 20 },
    { header: 'Statut Facture', key: 'statutFacture', width: 20 },
    { header: 'Origine (BC / Contrat)', key: 'origine', width: 25 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Référence / Commentaire', key: 'reference', width: 40 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  data.forEach(c => {
    let origine = '-';
    if (c.facture?.bonCommande) origine = `bonCommande: ${c.facture.bonCommande.numero}`;
    else if (c.facture?.contrat) origine = `Contrat: ${c.facture.contrat.numero}`;

    let refComm = c.reference || '';
    if (c.commentaire) refComm += (refComm ? ' | ' : '') + c.commentaire;

    worksheet.addRow({
      numeroCheque: c.numeroCheque,
      fournisseur: c.fournisseur.nom,
      montant: Number(c.montant),
      dateCreation: c.dateCreation.toLocaleDateString('fr-FR'),
      statut: c.statut,
      dateDecaissement: c.dateDecaissement ? c.dateDecaissement.toLocaleDateString('fr-FR') : '-',
      dateAnnulation: c.dateAnnulation ? c.dateAnnulation.toLocaleDateString('fr-FR') : '-',
      numeroFacture: c.facture?.numero || '-',
      statutFacture: c.facture?.statut.replace('_', ' ') || '-',
      origine: origine,
      type: c.type === 'BANQUE' ? 'Banque' : 'Simple',
      reference: refComm || '-',
    });
  });

  await writeAudit({ action: 'EXPORT', entity: 'Cheque', description: `Export Excel avancé de ${data.length} chèques`, userId: session.userId, username: session.username });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: { 'Content-Disposition': 'attachment; filename="rapport_cheques_complet.xlsx"', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
}