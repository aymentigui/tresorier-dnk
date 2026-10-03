'use server';

import { prisma } from '@/lib/prisma';
import { getTreasuryStats } from '@/lib/treasury';

export async function getDashboardData(startDateStr?: string, endDateStr?: string) {
  const treasury = await getTreasuryStats();

  // تحديد فترة البحث (Par défaut: آخر 6 أشهر إلى اليوم)
  const now = new Date();
  let startDate = startDateStr ? new Date(startDateStr) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  let endDate = endDateStr ? new Date(endDateStr) : new Date();
  endDate.setHours(23, 59, 59, 999);

  const periodFilter = { dateCreation: { gte: startDate, lte: endDate } };

  // إحصائيات في التداول للفترة المحددة
  const chequesCirc = await prisma.cheque.aggregate({
    where: { ...periodFilter, dateDecaissement: null }, _sum: { montant: true }, _count: { id: true }
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

  // حساب توزيع المصاريف للفترة المحددة
  const [chequesTotal, virementsTotal, taxesTotal] = await Promise.all([
    prisma.cheque.aggregate({ where: periodFilter, _sum: { montant: true } }),
    prisma.frais.aggregate({ where: { ...periodFilter, type: 'VIREMENT' }, _sum: { montant: true } }),
    prisma.frais.aggregate({ where: { ...periodFilter, type: 'TAX' }, _sum: { montant: true } })
  ]);

  const pieData = [
    { name: 'Chèques', value: Number(chequesTotal._sum.montant || 0), fill: '#0f766e' },
    { name: 'Virements', value: Number(virementsTotal._sum.montant || 0), fill: '#64748b' },
    { name: 'Taxes', value: Number(taxesTotal._sum.montant || 0), fill: '#f59e0b' }
  ].filter(item => item.value > 0);

  // حساب التدفقات النقدية للأشهر المحددة ديناميكياً
  const chqs = await prisma.cheque.findMany({ where: periodFilter, select: { dateCreation: true, montant: true } });
  const encs = await prisma.encaissement.findMany({ where: periodFilter, select: { dateCreation: true, montant: true } });

  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const monthlyMap = new Map<string, { name: string; cheques: number; encaissements: number; sortKey: string }>();

  // تعبئة الأشهر الفارغة باش يبان الغرافيك متصل
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

  return {
    treasury,
    kpis: {
      chequesCircCount: chequesCirc._count.id, chequesCircSum: Number(chequesCirc._sum.montant || 0),
      encaissementsCircCount: encaissementsCirc._count.id, encaissementsCircSum: Number(encaissementsCirc._sum.montant || 0),
      clientsCount, fournisseursCount
    },
    derniersCheques, chartData, pieData,
    period: { start: startDate.toISOString(), end: endDate.toISOString() }
  };
}