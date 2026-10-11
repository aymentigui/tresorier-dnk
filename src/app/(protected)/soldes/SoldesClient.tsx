'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSolde, activateSolde, deleteSolde } from './actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

type Solde = {
  id: string;
  montant: any; // Prisma Decimal
  dateCreation: Date;
  active: boolean;
};

export default function SoldesClient({
  initialData, totalPages, currentPage,
}: {
  initialData: Solde[];
  total: number;
  totalPages: number;
  currentPage: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatMontant = (montant: any) => {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(Number(montant));
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fr-FR');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await createSolde(formData);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Nouveau solde enregistré et activé !");
      setIsDialogOpen(false);
    }
    setLoading(false);
  };

  const handleActivate = async (id: string) => {
    if (!confirm("Voulez-vous définir ce solde comme actif ?")) return;
    const res = await activateSolde(id);
    if (res.error) toast.error(res.error);
    else toast.success("Solde activé");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce solde ?")) return;
    const res = await deleteSolde(id);
    if (res.error) toast.error(res.error);
    else toast.success("Solde supprimé");
  };

  const columns: ColumnDef<typeof features, Solde>[] = [
    {
      accessorKey: 'dateCreation',
      header: 'Date du Solde',
      cell: (info) => <span className="font-medium text-slate-900">{formatDate(info.getValue() as Date)}</span>,
    },
    {
      accessorKey: 'montant',
      header: 'Montant',
      cell: (info) => <span className="font-semibold tabular-nums text-slate-900">{formatMontant(info.getValue())}</span>,
    },
    {
      accessorKey: 'active',
      header: 'Statut',
      cell: (info) => {
        const isActive = info.getValue() as boolean;
        return isActive ? (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            <CheckCircle2 size={14} /> Actif
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            Inactif
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const solde = info.row.original;
        return (
          <div className="flex justify-end gap-2">
            {!solde.active && (
              <Button variant="outline" size="sm" onClick={() => handleActivate(solde.id)} className="text-xs">
                Activer
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => handleDelete(solde.id)} disabled={solde.active} className={`${solde.active ? 'opacity-30 cursor-not-allowed' : 'text-slate-500 hover:text-red-600'}`}>
              <Trash2 size={16} />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useTable({
    features,
    data: initialData,
    columns,
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex justify-end">
        <Button onClick={() => setIsDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus size={18} className="mr-2" /> Nouveau Solde
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                  Aucun solde trouvé.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
          <div>Page {currentPage} sur {totalPages}</div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={currentPage <= 1} onClick={() => router.push(`?page=${currentPage - 1}`)}>
              Précédent
            </Button>
            <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => router.push(`?page=${currentPage + 1}`)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Déclarer un nouveau solde</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Montant du solde (DA)</label>
              <Input type="number" step="0.01" id="montant" name="montant" required placeholder="Ex: 12450000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date de l&aposarrêté</label>
              <Input type="date" id="dateCreation" name="dateCreation" required defaultValue={new Date().toISOString().split('T')[0]} />
            </div>
            <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-md mt-2 border border-blue-100">
              Note : Ce solde deviendra le solde actif par défaut. Les calculs de disponibilité seront basés sur cette date.
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