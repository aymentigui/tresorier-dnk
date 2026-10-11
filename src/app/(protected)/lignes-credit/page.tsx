import { getLignesCredit } from './actions';
import LignesCreditClient from './LignesCreditClient';

export default async function LignesCreditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  const { data, total, totalPages } = await getLignesCredit(page, 10);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lignes de crédit</h1>
          <p className="text-slate-500 mt-1">Gérez vos entrées de fonds et lignes de crédit (avec activation et expiration).</p>
        </div>
      </div>
      
      <LignesCreditClient 
        initialData={data} 
        total={total} 
        totalPages={totalPages} 
        currentPage={page} 
      />
    </div>
  );
}