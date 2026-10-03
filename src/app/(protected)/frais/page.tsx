import { getFrais } from './actions';
import FraisClient from './FraisClient';

export default async function FraisPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  const search = resolvedParams?.search || '';
  
  const { data, total, totalPages } = await getFrais(page, search, 10);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Frais & Taxes</h1>
          <p className="text-slate-500 mt-1">Gérez vos sorties d'argent diverses.</p>
        </div>
      </div>
      
      <FraisClient 
        initialData={data} 
        total={total} 
        totalPages={totalPages} 
        currentPage={page} 
        currentSearch={search} 
      />
    </div>
  );
}