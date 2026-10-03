import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { writeAudit } from '@/lib/audit';
import { getDashboardData } from '@/app/(protected)/dashboard/actions'; // نستعملو الدالة اللي حسبت كلش!

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);
  if (!session) return new NextResponse('Non autorisé', { status: 401 });

  const url = new URL(req.url);
  const start = url.searchParams.get('start') || undefined;
  const end = url.searchParams.get('end') || undefined;

  // جلب البيانات المحسوبة مسبقاً بنفس التواريخ
  const data = await getDashboardData(start, end);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Rapport Trésorerie');

  worksheet.columns = [{ width: 40 }, { width: 30 }];

  // عنوان التقرير
  worksheet.addRow(['RAPPORT DE TRÉSORERIE']).font = { bold: true, size: 16 };
  worksheet.addRow([`Période du ${new Date(data.period.start).toLocaleDateString('fr-FR')} au ${new Date(data.period.end).toLocaleDateString('fr-FR')}`]);
  worksheet.addRow([]);

  // مؤشرات الرصيد
  worksheet.addRow(['INDICATEURS GLOBAUX']).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.lastRow!.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  
  worksheet.addRow(['Solde actuel en banque (DA):', Number(data.treasury.soldeActuel)]);
  worksheet.addRow(['Disponibilité projetée (DA):', Number(data.treasury.disponibilite)]);
  worksheet.addRow([]);

  // مؤشرات التداول
  worksheet.addRow(['EN CIRCULATION (Sur la période)']).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.lastRow!.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  
  worksheet.addRow(['Chèques à traiter (Montant DA):', data.kpis.chequesCircSum]);
  worksheet.addRow(['Nombre de chèques à traiter:', data.kpis.chequesCircCount]);
  worksheet.addRow(['Encaissements attendus (Montant DA):', data.kpis.encaissementsCircSum]);
  worksheet.addRow(['Nombre d\'encaissements attendus:', data.kpis.encaissementsCircCount]);
  worksheet.addRow([]);

  // تفاصيل المصاريف
  worksheet.addRow(['RÉPARTITION DES DÉPENSES']).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.lastRow!.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  
  data.pieData.forEach(item => {
    worksheet.addRow([item.name + ' (DA):', item.value]);
  });

  await writeAudit({
    action: 'EXPORT',
    entity: 'Dashboard',
    description: `Export du rapport de trésorerie (${start || 'Défaut'} à ${end || 'Défaut'})`,
    userId: session.userId,
    username: session.username,
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Disposition': 'attachment; filename="rapport_tresorerie.xlsx"',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}