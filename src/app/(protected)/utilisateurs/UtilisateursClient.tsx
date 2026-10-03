'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUser, updateUser, deleteUser, toggleBlockUser } from './actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { Plus, Search, Edit2, Trash2, Loader2, ShieldOff, ShieldCheck, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

type Role = { id: string; name: string; code: string; };

type User = {
  id: string;
  username: string;
  fullName: string | null;
  isBlocked: boolean;
  createdAt: Date;
  roles: Role[];
};

export default function UtilisateursClient({
  initialData, totalPages, currentPage, currentSearch, roles
}: {
  initialData: User[];
  total: number;
  totalPages: number;
  currentPage: number;
  currentSearch: string;
  roles: Role[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(currentSearch);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // State للأدوار المختارة في الفورميلار
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search) params.set('search', search);
    else params.delete('search');
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setSelectedRoles(user.roles.map(r => r.id));
    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('username') as HTMLInputElement).value = user.username;
      (document.getElementById('fullName') as HTMLInputElement).value = user.fullName || '';
      (document.getElementById('password') as HTMLInputElement).value = ''; // نخلوه فارغ للحماية
    }, 50);
  };

  const openNew = () => {
    setEditingUser(null);
    setSelectedRoles([]);
    setIsDialogOpen(true);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev => 
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    // إضافة الأدوار المختارة للـ FormData
    selectedRoles.forEach(roleId => formData.append('roles', roleId));

    const res = editingUser 
      ? await updateUser(editingUser.id, formData)
      : await createUser(formData);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(editingUser ? "Utilisateur modifié" : "Utilisateur créé");
      setIsDialogOpen(false);
    }
    setLoading(false);
  };

  const handleToggleBlock = async (user: User) => {
    const actionStr = user.isBlocked ? 'débloquer' : 'bloquer';
    if (!confirm(`Voulez-vous vraiment ${actionStr} cet utilisateur ?`)) return;
    
    const res = await toggleBlockUser(user.id, !user.isBlocked);
    if (res.error) toast.error(res.error);
    else toast.success(`Utilisateur ${user.isBlocked ? 'débloqué' : 'bloqué'}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cet utilisateur ? Cette action est irréversible.")) return;
    const res = await deleteUser(id);
    if (res.error) toast.error(res.error);
    else toast.success("Utilisateur supprimé");
  };

  const columns: ColumnDef<typeof features, User>[] = [
    {
      accessorKey: 'username',
      header: 'name d\'utilisateur',
      cell: (info) => (
        <div>
          <span className="font-semibold text-slate-900 block">{info.getValue() as string}</span>
          <span className="text-xs text-slate-500">{info.row.original.fullName}</span>
        </div>
      ),
    },
    {
      id: 'roles',
      header: 'Rôles',
      cell: (info) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {info.row.original.roles.map(r => (
            <span key={r.id} className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
              {r.name}
            </span>
          ))}
          {info.row.original.roles.length === 0 && <span className="text-xs text-slate-400">Aucun rôle</span>}
        </div>
      ),
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (info) => {
        const isBlocked = info.row.original.isBlocked;
        return isBlocked ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <Lock size={12} /> Bloqué
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            <ShieldCheck size={12} /> Actif
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const user = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => handleToggleBlock(user)} title={user.isBlocked ? "Débloquer" : "Bloquer"} className={user.isBlocked ? "text-emerald-600 hover:bg-emerald-50" : "text-amber-600 hover:bg-amber-50"}>
              {user.isBlocked ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(user)} className="text-slate-500 hover:text-indigo-600">
              <Edit2 size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} className="text-slate-500 hover:text-red-600">
              <Trash2 size={16} />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useTable({ features, data: initialData, columns });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between gap-4">
        <form onSubmit={handleSearch} className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un utilisateur..." className="pl-10" />
        </form>
        <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800 text-white">
          <Plus size={18} className="mr-2" /> Nouvel Utilisateur
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun utilisateur trouvé.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
          <div>Page {currentPage} sur {totalPages}</div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={currentPage <= 1} onClick={() => router.push(`?page=${currentPage - 1}&search=${search}`)}>Précédent</Button>
            <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => router.push(`?page=${currentPage + 1}&search=${search}`)}>Suivant</Button>
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Modifier l\'utilisateur' : 'Créer un utilisateur'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">name d'utilisateur *</label>
                <Input id="username" name="username" required placeholder="ex: admin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">name complet</label>
                <Input id="fullName" name="fullName" placeholder="ex: John Doe" />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe {editingUser && '(Optionnel)'}</label>
              <Input type="password" id="password" name="password" required={!editingUser} placeholder={editingUser ? "Laisser vide pour ne pas changer" : "Minimum 6 caractères"} minLength={6} />
            </div>

            <div className="pt-2">
              <label className="block text-sm font-bold text-slate-900 mb-3 border-b pb-2">Rôles assignés</label>
              <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto">
                {roles.map(role => (
                  <label key={role.id} className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded border border-slate-100 hover:bg-slate-100 transition-colors">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                      checked={selectedRoles.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    <span className="text-sm font-medium text-slate-700">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}