import { getFournisseurs } from './actions';
import FournisseursClient from './FournisseursClient';

export default async function FournisseursPage({
  searchParams,
}: {
  searchParams: Promise<any>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  const filters = {
    page, limit: 10,
    search: resolvedParams?.search || '',
    activite: resolvedParams?.activite || '',
    alerteSeuil: resolvedParams?.alerteSeuil || '',
  };
  
  const result = await getFournisseurs(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fournisseurs & Analyse</h1>
          <p className="text-slate-500 mt-1">Gérez vos fournisseurs, analysez les seuils d&aposalerte et importez depuis Excel.</p>
        </div>
      </div>
      
      <FournisseursClient 
        initialData={result.data as any} 
        summary={result.summary}
        total={result.total} 
        totalPages={result.totalPages} 
        currentPage={page} 
        currentFilters={filters}
      />
    </div>
  );
}