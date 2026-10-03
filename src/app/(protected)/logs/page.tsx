import { getLogs, getUsersList } from './actions';
import LogsClient from './LogsClient';

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; userId?: string; action?: string; entity?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  const filters = {
    page,
    limit: 15,
    search: resolvedParams?.search || '',
    userId: resolvedParams?.userId || '',
    action: resolvedParams?.action || '',
    entity: resolvedParams?.entity || '',
  };
  
  const [logsData, usersList] = await Promise.all([
    getLogs(filters),
    getUsersList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Journal d'audit</h1>
          <p className="text-slate-500 mt-1">Traçabilité complète des actions effectuées sur le système.</p>
        </div>
      </div>
      
      <LogsClient 
        initialData={logsData.data} 
        total={logsData.total} 
        totalPages={logsData.totalPages} 
        currentPage={page} 
        currentFilters={filters}
        users={usersList}
      />
    </div>
  );
}