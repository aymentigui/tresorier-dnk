import { getClients } from './actions';
import ClientsClient from './ClientsClient';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  const search = resolvedParams?.search || '';
  
  const { data, total, totalPages } = await getClients(page, search, 10);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">Gérez votre liste de clients.</p>
        </div>
      </div>
      
      <ClientsClient 
        initialData={data} 
        total={total} 
        totalPages={totalPages} 
        currentPage={page} 
        currentSearch={search} 
      />
    </div>
  );
}