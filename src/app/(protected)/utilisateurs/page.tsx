import { getUsers, getRolesList } from './actions';
import UtilisateursClient from './UtilisateursClient';

export default async function UtilisateursPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  const search = resolvedParams?.search || '';
  
  const [usersData, rolesList] = await Promise.all([
    getUsers(page, search, 10),
    getRolesList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Utilisateurs & Rôles</h1>
          <p className="text-slate-500 mt-1">Gérez les accès, les comptes et les permissions du système.</p>
        </div>
      </div>
      
      <UtilisateursClient 
        initialData={usersData.data as any} 
        total={usersData.total} 
        totalPages={usersData.totalPages} 
        currentPage={page} 
        currentSearch={search} 
        roles={rolesList}
      />
    </div>
  );
}