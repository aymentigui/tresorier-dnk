import { getFournisseurs } from './actions';
import FournisseursClient from './FournisseursClient';

export default async function FournisseursPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  // Await searchParams for Next.js 15+
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  const search = resolvedParams?.search || '';
  
  // نعيطو للـ Backend باش نجيبو البيانات
  const { data, total, totalPages } = await getFournisseurs(page, search, 10);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fournisseurs</h1>
          <p className="text-slate-500 mt-1">Gérez vos fournisseurs et leurs activités.</p>
        </div>
      </div>
      
      {/* نبعتو البيانات للمكون تاع الواجهة اللي راح نخدموه في الخطوة 4 */}
      <FournisseursClient 
        initialData={data} 
        total={total} 
        totalPages={totalPages} 
        currentPage={page} 
        currentSearch={search} 
      />
    </div>
  );
}