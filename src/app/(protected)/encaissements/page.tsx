import { getEncaissements, getClientsList } from './actions';
import EncaissementsClient from './EncaissementsClient';

export default async function EncaissementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; clientId?: string; statut?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  const filters = {
    page,
    limit: 10,
    clientId: resolvedParams?.clientId || '',
    statut: resolvedParams?.statut || '',
  };
  
  const [encaissementsData, clientsList] = await Promise.all([
    getEncaissements(filters),
    getClientsList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Encaissements</h1>
          <p className="text-slate-500 mt-1">Gérez vos entrées d'argent et règlements clients.</p>
        </div>
      </div>
      
      <EncaissementsClient 
        initialData={encaissementsData.data} 
        summary={encaissementsData.summary}
        total={encaissementsData.total} 
        totalPages={encaissementsData.totalPages} 
        currentPage={page} 
        currentFilters={{ clientId: filters.clientId, statut: filters.statut }}
        clients={clientsList}
      />
    </div>
  );
}