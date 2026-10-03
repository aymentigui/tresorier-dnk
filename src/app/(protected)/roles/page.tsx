import { getRoles, getPermissionsList } from './actions';
import RolesClient from './RolesClient';

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  const search = resolvedParams?.search || '';
  
  const [rolesData, permissionsList] = await Promise.all([
    getRoles(page, search, 10),
    getPermissionsList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rôles & Permissions</h1>
          <p className="text-slate-500 mt-1">Créez des rôles sur mesure et définissez leurs habilitations.</p>
        </div>
      </div>
      
      <RolesClient 
        initialData={rolesData.data as any} 
        total={rolesData.total} 
        totalPages={rolesData.totalPages} 
        currentPage={page} 
        currentSearch={search} 
        permissions={permissionsList as any}
      />
    </div>
  );
}