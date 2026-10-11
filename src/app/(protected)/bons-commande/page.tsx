import { getBonsCommandes, getFournisseursList } from './actions';
import BonsCommandesClient from './BonsCommandesClient';

export default async function BonsCommandesPage({
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
    dateDebutMin: resolvedParams?.dateDebutMin || '',
    dateDebutMax: resolvedParams?.dateDebutMax || '',
    montantMin: resolvedParams?.montantMin || '',
    montantMax: resolvedParams?.montantMax || '',
  };
  
  const [bcsData, fournisseursList] = await Promise.all([
    getBonsCommandes(filters),
    getFournisseursList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bons de Commande & Filtres Pro</h1>
          <p className="text-slate-500 mt-1">Gérez vos BC, importez via Excel et analysez les données.</p>
        </div>
      </div>
      
      <BonsCommandesClient 
        initialData={bcsData.data as any} 
        summary={bcsData.summary}
        total={bcsData.total} 
        totalPages={bcsData.totalPages} 
        currentPage={page} 
        currentFilters={filters}
        fournisseurs={fournisseursList}
      />
    </div>
  );
}