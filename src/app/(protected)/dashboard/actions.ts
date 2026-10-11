'use server';

import { prisma } from '@/lib/prisma';
import { getTreasuryStats } from '@/lib/treasury';

export async function getDashboardData(startDateStr?: string, endDateStr?: string) {
  const treasury = await getTreasuryStats();

  // تحديد فترة البحث
  const now = new Date();
  let startDate = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  let endDate = endDateStr ? new Date(endDateStr) : new Date();
  endDate.setHours(23, 59, 59, 999);

  const periodFilter = { dateCreation: { gte: startDate, lte: endDate } };

  const chequesCirc = await prisma.cheque.aggregate({
    where: { ...periodFilter, dateDecaissement: null, statut: { not: 'ANNULE' } }, _sum: { montant: true }, _count: { id: true }
  });
  const encaissementsCirc = await prisma.encaissement.aggregate({
    where: { ...periodFilter, dateEncaissement: null }, _sum: { montant: true }, _count: { id: true }
  });

  const clientsCount = await prisma.client.count();
  const fournisseursCount = await prisma.fournisseur.count();

  const derniersCheques = await prisma.cheque.findMany({
    take: 5, orderBy: { dateCreation: 'desc' },
    include: { fournisseur: { select: { nom: true } } }
  });

  const [chequesTotal, virementsTotal, taxesTotal] = await Promise.all([
    prisma.cheque.aggregate({ where: { ...periodFilter, statut: { not: 'ANNULE' } }, _sum: { montant: true } }),
    prisma.frais.aggregate({ where: { ...periodFilter, type: 'VIREMENT' }, _sum: { montant: true } }),
    prisma.frais.aggregate({ where: { ...periodFilter, type: 'TAX' }, _sum: { montant: true } })
  ]);

  const pieData = [
    { name: 'Chèques', value: Number(chequesTotal._sum.montant || 0), fill: '#0f766e' },
    { name: 'Virements', value: Number(virementsTotal._sum.montant || 0), fill: '#64748b' },
    { name: 'Taxes', value: Number(taxesTotal._sum.montant || 0), fill: '#f59e0b' }
  ].filter(item => item.value > 0);

  const chqs = await prisma.cheque.findMany({ where: { ...periodFilter, statut: { not: 'ANNULE' } }, select: { dateCreation: true, montant: true } });
  const encs = await prisma.encaissement.findMany({ where: periodFilter, select: { dateCreation: true, montant: true } });

  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const monthlyMap = new Map<string, { name: string; cheques: number; encaissements: number; sortKey: string }>();

  let curr = new Date(startDate);
  curr.setDate(1);
  while (curr <= endDate) {
    const m = curr.getMonth();
    const y = curr.getFullYear();
    const key = `${y}-${m.toString().padStart(2, '0')}`;
    monthlyMap.set(key, { name: `${monthNames[m]} ${y.toString().slice(2)}`, cheques: 0, encaissements: 0, sortKey: key });
    curr.setMonth(curr.getMonth() + 1);
  }

  chqs.forEach(c => {
    const key = `${c.dateCreation.getFullYear()}-${c.dateCreation.getMonth().toString().padStart(2, '0')}`;
    if (monthlyMap.has(key)) monthlyMap.get(key)!.cheques += Number(c.montant);
  });
  encs.forEach(e => {
    const key = `${e.dateCreation.getFullYear()}-${e.dateCreation.getMonth().toString().padStart(2, '0')}`;
    if (monthlyMap.has(key)) monthlyMap.get(key)!.encaissements += Number(e.montant);
  });

  const chartData = Array.from(monthlyMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // ==========================================
  // Alertes Seuils
  // ==========================================
  
  // 1. الموردين
  const alertFournisseursRaw = await prisma.fournisseur.findMany({
    where: { seuilActive: true, seuil: { gt: 0 } },
    select: { id: true, nom: true, cumulMontant: true, seuil: true }
  });
  
  const alertFournisseurs = alertFournisseursRaw
    .map(f => ({ ...f, pct: (Number(f.cumulMontant) / Number(f.seuil)) * 100 }))
    .filter(f => f.pct >= 90)
    .sort((a, b) => b.pct - a.pct);

  // 2. العقود (بالفواتير + الاستهلاك الأولي)
  const alertContratsRaw = await prisma.contrat.findMany({
    where: { isActive: true, seuilActive: true, seuil: { gt: 0 } },
    include: {
      fournisseur: { select: { nom: true } },
      factures: { select: { montant: true } }
    }
  });

  const alertContrats = alertContratsRaw.map(c => {
    const seuil = Number(c.seuil);
    // نضيفو الاستهلاك الأولي للحساب
    let totalFactures = Number(c.montantConsommeInitial || 0);
    
    // نجمعو مبالغ الفواتير المربوطة بهاد العقد
    c.factures.forEach(f => { totalFactures += Number(f.montant); });
    
    // حساب النسبة
    const pct = (totalFactures / seuil) * 100;
    
    return { id: c.id, numero: c.numero, fournisseur: c.fournisseur.nom, pct };
  }).filter(c => c.pct >= 90).sort((a, b) => b.pct - a.pct);

  return {
    treasury,
    kpis: {
      chequesCircCount: chequesCirc._count.id, chequesCircSum: Number(chequesCirc._sum.montant || 0),
      encaissementsCircCount: encaissementsCirc._count.id, encaissementsCircSum: Number(encaissementsCirc._sum.montant || 0),
      clientsCount, fournisseursCount
    },
    derniersCheques, chartData, pieData,
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    alerts: { fournisseurs: alertFournisseurs, contrats: alertContrats }
  };
}