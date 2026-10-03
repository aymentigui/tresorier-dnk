import { getCheques, getFournisseursList } from './actions';
import ChequesClient from './ChequesClient';

export default async function ChequesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; fournisseurId?: string; statut?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  // قراءة الفلاتر من الرابط
  const filters = {
    page,
    limit: 10,
    search: resolvedParams?.search || '',
    fournisseurId: resolvedParams?.fournisseurId || '',
    statut: resolvedParams?.statut || '',
  };
  
  // نجيبو الشيكات، المجاميع، وقائمة الموردين في نفس الوقت
  const [chequesData, fournisseursList] = await Promise.all([
    getCheques(filters),
    getFournisseursList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chèques</h1>
          <p className="text-slate-500 mt-1">Gérez l'émission et le suivi de vos chèques fournisseurs.</p>
        </div>
      </div>
      
      {/* هذا المكون راح نخدموه في الرسالة الجاية */}
      <ChequesClient 
        initialData={chequesData.data} 
        summary={chequesData.summary}
        total={chequesData.total} 
        totalPages={chequesData.totalPages} 
        currentPage={page} 
        currentFilters={{ search: filters.search, fournisseurId: filters.fournisseurId, statut: filters.statut }}
        fournisseurs={fournisseursList}
      />
    </div>
  );
}