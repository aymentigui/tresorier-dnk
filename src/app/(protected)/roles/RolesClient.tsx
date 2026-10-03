'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createRole, updateRole, deleteRole } from './actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { Plus, Search, Edit2, Trash2, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

type Permission = { id: string; code: string; description?: string };
type Role = { id: string; name: string; description?: string; permissions: Permission[] };

export default function RolesClient({
  initialData, totalPages, currentPage, currentSearch, permissions
}: {
  initialData: Role[];
  total: number;
  totalPages: number;
  currentPage: number;
  currentSearch: string;
  permissions: Permission[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(currentSearch);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search) params.set('search', search); else params.delete('search');
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setSelectedPerms(role.permissions.map(p => p.id));
    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('name') as HTMLInputElement).value = role.name;
      (document.getElementById('description') as HTMLInputElement).value = role.description || '';
    }, 50);
  };

  const openNew = () => {
    setEditingRole(null);
    setSelectedPerms([]);
    setIsDialogOpen(true);
  };

  const togglePermission = (permId: string) => {
    setSelectedPerms(prev => prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    selectedPerms.forEach(id => formData.append('permissions', id));

    const res = editingRole ? await updateRole(editingRole.id, formData) : await createRole(formData);

    if (res.error) toast.error(res.error);
    else {
      toast.success(editingRole ? "Rôle modifié" : "Rôle créé");
      setIsDialogOpen(false);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous supprimer ce rôle ?")) return;
    const res = await deleteRole(id);
    if (res.error) toast.error(res.error);
    else toast.success("Rôle supprimé");
  };

  const columns: ColumnDef<typeof features, Role>[] = [
    {
      accessorKey: 'name',
      header: 'Nom du Rôle',
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-900">{info.getValue() as string}</span>
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: (info) => <span className="text-slate-500 text-sm">{(info.getValue() as string) || '-'}</span>,
    },
    {
      id: 'permissionsCount',
      header: 'Permissions',
      cell: (info) => (
        <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium border border-slate-200">
          {info.row.original.permissions.length} actives
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const role = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(role)} className="text-slate-500 hover:text-indigo-600"><Edit2 size={16} /></Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(role.id)} className="text-slate-500 hover:text-red-600"><Trash2 size={16} /></Button>
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un rôle..." className="pl-10" />
        </form>
        <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800 text-white">
          <Plus size={18} className="mr-2" /> Nouveau Rôle
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-50">
                {headerGroup.headers.map((header) => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun rôle trouvé.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>{editingRole ? 'Modifier le rôle' : 'Créer un rôle'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 flex flex-col flex-1 overflow-hidden mt-4">
            <div className="grid grid-cols-2 gap-4 shrink-0">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom du rôle *</label>
                <Input id="name" name="name" required placeholder="ex: Comptable" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <Input id="description" name="description" placeholder="ex: Accès à la trésorerie" />
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col pt-2">
              <div className="flex justify-between items-center mb-2 border-b pb-2">
                <label className="block text-sm font-bold text-slate-900">Permissions associées</label>
                <div className="space-x-2 text-xs">
                  <button type="button" onClick={() => setSelectedPerms(permissions.map(p => p.id))} className="text-emerald-600 font-medium hover:underline">Tout cocher</button>
                  <span className="text-slate-300">|</span>
                  <button type="button" onClick={() => setSelectedPerms([])} className="text-slate-500 font-medium hover:underline">Tout décocher</button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto pr-2 pb-2">
                {permissions.map(perm => (
                  <label key={perm.id} className="flex items-start gap-2 cursor-pointer bg-slate-50 p-2 rounded border border-slate-100 hover:bg-slate-100 transition-colors">
                    <input 
                      type="checkbox" 
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                      checked={selectedPerms.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">{perm.code}</span>
                      {perm.description && <span className="text-[10px] text-slate-500 leading-tight block">{perm.description}</span>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}