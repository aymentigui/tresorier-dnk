'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { Search, Eye, FilterX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

type Log = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  before: any;
  after: any;
  username: string | null;
  createdAt: Date;
  user: { username: string; fullName: string } | null;
};

type User = { id: string; username: string; fullName: string; };

export default function LogsClient({
  initialData, totalPages, currentPage, currentFilters, users
}: {
  initialData: Log[];
  total: number;
  totalPages: number;
  currentPage: number;
  currentFilters: { search: string; userId: string; action: string; entity: string };
  users: User[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filterSearch, setFilterSearch] = useState(currentFilters.search);
  const [filterUser, setFilterUser] = useState(currentFilters.userId);
  const [filterAction, setFilterAction] = useState(currentFilters.action);
  const [filterEntity, setFilterEntity] = useState(currentFilters.entity);

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (filterSearch) params.set('search', filterSearch);
    if (filterUser) params.set('userId', filterUser);
    if (filterAction) params.set('action', filterAction);
    if (filterEntity) params.set('entity', filterEntity);
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const resetFilters = () => {
    setFilterSearch('');
    setFilterUser('');
    setFilterAction('');
    setFilterEntity('');
    router.push('?page=1');
  };

  const openDetails = (log: Log) => {
    setSelectedLog(log);
    setIsDialogOpen(true);
  };

  // ألوان الأفعال (Actions)
  const getActionColor = (action: string) => {
    if (['CREATE', 'IMPORT'].includes(action)) return 'bg-emerald-100 text-emerald-800';
    if (['UPDATE', 'ACTIVATE_SOLDE'].includes(action)) return 'bg-blue-100 text-blue-800';
    if (['DELETE', 'BLOCK'].includes(action)) return 'bg-red-100 text-red-800';
    if (['LOGIN', 'LOGIN_FAILED', 'LOGOUT'].includes(action)) return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-800';
  };

  const columns: ColumnDef<typeof features, Log>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Date & Heure',
      cell: (info) => <span className="text-slate-600 text-xs font-medium">{formatDateTime(info.getValue() as Date)}</span>,
    },
    {
      id: 'utilisateur',
      header: 'Utilisateur',
      cell: (info) => {
        const log = info.row.original;
        const displayName = log.user ? log.user.username : log.username;
        return <span className="font-semibold text-slate-900">{displayName || 'Système'}</span>;
      },
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: (info) => {
        const action = info.getValue() as string;
        return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getActionColor(action)}`}>{action}</span>;
      },
    },
    {
      accessorKey: 'entity',
      header: 'Module',
      cell: (info) => <span className="text-slate-700 font-medium">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: (info) => <span className="text-slate-600 truncate max-w-[300px] block" title={info.getValue() as string}>{info.getValue() as string}</span>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Détails</div>,
      cell: (info) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => openDetails(info.row.original)} className="text-slate-500 hover:text-indigo-600 h-8 px-2">
            <Eye size={16} className="mr-1" /> Voir
          </Button>
        </div>
      ),
    },
  ];

  const table = useTable({ features, data: initialData, columns });

  // قائمة الأفعال والوحدات للفلترة
  const actionsList = ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'BLOCK', 'UNBLOCK', 'ACTIVATE_SOLDE'];
  const entitiesList = ['Cheque', 'Encaissement', 'Fournisseur', 'Client', 'LigneCredit', 'Frais', 'SoldeBanque', 'User', 'Role'];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      
      {/* شريط الفلاتر المتقدم */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-48">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Recherche (Texte/ID)</label>
          <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Mot clé..." className="bg-white h-9" />
        </div>
        
        <div className="w-full sm:w-40">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Utilisateur</label>
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
            <option value="">Tous</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </div>

        <div className="w-full sm:w-36">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Action</label>
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
            <option value="">Toutes</option>
            {actionsList.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="w-full sm:w-36">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Module (Entité)</label>
          <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
            <option value="">Tous</option>
            {entitiesList.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <Button onClick={applyFilters} className="bg-slate-900 text-white h-9">Filtrer</Button>
          <Button onClick={resetFilters} variant="outline" size="icon" className="h-9 w-9" title="Réinitialiser"><FilterX size={16} /></Button>
        </div>
      </div>

      {/* الجدول */}
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
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun journal trouvé.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
          <div>Page {currentPage} sur {totalPages}</div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={currentPage <= 1} onClick={() => router.push(`?page=${currentPage - 1}`)}>Précédent</Button>
            <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => router.push(`?page=${currentPage + 1}`)}>Suivant</Button>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل الـ Log (JSON Diff) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Détails de l&aposaction</DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
                <div><span className="text-slate-500">Utilisateur:</span> <span className="font-semibold">{selectedLog.user?.username || selectedLog.username}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-semibold">{formatDateTime(selectedLog.createdAt)}</span></div>
                <div><span className="text-slate-500">Action:</span> <span className={`inline-flex px-1.5 rounded text-[10px] font-bold ${getActionColor(selectedLog.action)}`}>{selectedLog.action}</span></div>
                <div><span className="text-slate-500">Module:</span> <span className="font-semibold">{selectedLog.entity}</span></div>
                <div className="col-span-2"><span className="text-slate-500">Description:</span> <span className="font-medium">{selectedLog.description}</span></div>
                {selectedLog.entityId && <div className="col-span-2"><span className="text-slate-500">ID Cible:</span> <span className="font-mono text-xs">{selectedLog.entityId}</span></div>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedLog.before && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase">Avant (Anciennes valeurs)</h3>
                    <pre className="bg-slate-900 text-slate-50 p-3 rounded-lg text-xs overflow-x-auto max-h-60 overflow-y-auto font-mono">
                      {JSON.stringify(selectedLog.before, null, 2)}
                    </pre>
                  </div>
                )}
                {selectedLog.after && (
                  <div className={!selectedLog.before ? 'md:col-span-2' : ''}>
                    <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase">Après (Nouvelles valeurs)</h3>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg text-xs overflow-x-auto max-h-60 overflow-y-auto font-mono border border-slate-800">
                      {JSON.stringify(selectedLog.after, null, 2)}
                    </pre>
                  </div>
                )}
                {!selectedLog.before && !selectedLog.after && (
                  <div className="col-span-2 text-center py-6 text-slate-400 text-sm">
                    Aucune donnée brute associée à cette action.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}