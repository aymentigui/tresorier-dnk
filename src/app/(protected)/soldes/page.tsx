import { getSoldes } from './actions';
import SoldesClient from './SoldesClient';

export default async function SoldesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  const { data, total, totalPages } = await getSoldes(page, 10);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Soldes bancaires</h1>
          <p className="text-slate-500 mt-1">Gérez vos arrêtés de caisse et soldes.</p>
        </div>
      </div>
      
      <SoldesClient 
        initialData={data} 
        total={total} 
        totalPages={totalPages} 
        currentPage={page} 
      />
    </div>
  );
}