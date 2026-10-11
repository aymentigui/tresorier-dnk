import { getContrats, getFournisseursList } from './actions';
import ContratsClient from './ContratsClient';

export default async function ContratsPage({
  searchParams,
}: {
  searchParams: Promise<any>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  const filters = {
    page, limit: 10,
    search: resolvedParams?.search || '',
    fournisseurId: resolvedParams?.fournisseurId || '',
    statut: resolvedParams?.statut || '',
    dateDebutMin: resolvedParams?.dateDebutMin || '',
    dateDebutMax: resolvedParams?.dateDebutMax || '',
    dateFinMin: resolvedParams?.dateFinMin || '',
    dateFinMax: resolvedParams?.dateFinMax || '',
    montantMin: resolvedParams?.montantMin || '',
    montantMax: resolvedParams?.montantMax || '',
  };
  
  const [contratsData, fournisseursList] = await Promise.all([
    getContrats(filters),
    getFournisseursList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contrats & Filtres Pro</h1>
          <p className="text-slate-500 mt-1">Gérez vos contrats, renouvellements, et alertes de seuil.</p>
        </div>
      </div>
      
      <ContratsClient 
        initialData={contratsData.data as any} 
        summary={contratsData.summary}
        total={contratsData.total} 
        totalPages={contratsData.totalPages} 
        currentPage={page} 
        currentFilters={filters}
        fournisseurs={fournisseursList}
      />
    </div>
  );
}