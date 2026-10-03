'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLigneCredit, updateLigneCredit, deleteLigneCredit } from './actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

type LigneCredit = {
  id: string;
  montant: any; // Decimal
  dateCreation: Date;
};

export default function LignesCreditClient({
  initialData, totalPages, currentPage,
}: {
  initialData: LigneCredit[];
  total: number;
  totalPages: number;
  currentPage: number;
}) {
  const router = useRouter();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const formatMontant = (montant: any) => {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(Number(montant));
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fr-FR');
  };

  const openEdit = (ligne: LigneCredit) => {
    setEditingId(ligne.id);
    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('montant') as HTMLInputElement).value = String(ligne.montant);
      (document.getElementById('dateCreation') as HTMLInputElement).value = new Date(ligne.dateCreation).toISOString().split('T')[0];
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const res = editingId 
      ? await updateLigneCredit(editingId, formData)
      : await createLigneCredit(formData);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(editingId ? "Ligne modifiée" : "Ligne ajoutée");
      setIsDialogOpen(false);
      setEditingId(null);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette ligne de crédit ?")) return;
    const res = await deleteLigneCredit(id);
    if (res.error) toast.error(res.error);
    else toast.success("Ligne supprimée");
  };

  const columns: ColumnDef<typeof features, LigneCredit>[] = [
    {
      accessorKey: 'dateCreation',
      header: 'Date',
      cell: (info) => <span className="text-slate-600">{formatDate(info.getValue() as Date)}</span>,
    },
    {
      accessorKey: 'montant',
      header: 'Montant (DA)',
      cell: (info) => <span className="font-semibold tabular-nums text-slate-900">{formatMontant(info.getValue())}</span>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const ligne = info.row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(ligne)} className="text-slate-500 hover:text-emerald-600">
              <Edit2 size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(ligne.id)} className="text-slate-500 hover:text-red-600">
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
        <Button onClick={() => { setEditingId(null); setIsDialogOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus size={18} className="mr-2" /> Nouvelle Ligne
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
                  Aucune ligne de crédit trouvée.
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
            <DialogTitle>{editingId ? 'Modifier la ligne' : 'Ajouter une ligne de crédit'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant (DA)</label>
                <Input type="number" step="0.01" id="montant" name="montant" required placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <Input type="date" id="dateCreation" name="dateCreation" required defaultValue={new Date().toISOString().split('T')[0]} />
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