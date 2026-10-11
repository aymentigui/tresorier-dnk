'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLigneCredit, updateLigneCredit, deleteLigneCredit, toggleLigneCreditStatus } from './actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { Plus, Edit2, Trash2, Loader2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

type LigneCredit = {
  id: string;
  montant: any; // Decimal
  dateCreation: Date;
  dateFin: Date | null;
  isActive: boolean;
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

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR');
  };

  const openEdit = (ligne: LigneCredit) => {
    setEditingId(ligne.id);
    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('montant') as HTMLInputElement).value = String(ligne.montant);
      (document.getElementById('dateCreation') as HTMLInputElement).value = new Date(ligne.dateCreation).toISOString().split('T')[0];
      if (ligne.dateFin) {
        (document.getElementById('dateFin') as HTMLInputElement).value = new Date(ligne.dateFin).toISOString().split('T')[0];
      } else {
        (document.getElementById('dateFin') as HTMLInputElement).value = '';
      }
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

  const handleToggleStatus = async (ligne: LigneCredit) => {
    const actionStr = ligne.isActive ? "désactiver" : "activer";
    if (!confirm(`Voulez-vous vraiment ${actionStr} cette ligne de crédit ?`)) return;
    
    const res = await toggleLigneCreditStatus(ligne.id, ligne.isActive);
    if (res.error) toast.error(res.error);
    else toast.success(`Ligne ${ligne.isActive ? "désactivée" : "activée"} avec succès`);
  };

  const columns: ColumnDef<typeof features, LigneCredit>[] = [
    {
      accessorKey: 'dateCreation',
      header: 'Date de début',
      cell: (info) => <span className="text-slate-600 font-medium">{formatDate(info.getValue() as Date)}</span>,
    },
    {
      accessorKey: 'dateFin',
      header: 'Date de fin',
      cell: (info) => <span className="text-slate-600">{formatDate(info.getValue() as Date | null)}</span>,
    },
    {
      accessorKey: 'montant',
      header: 'Montant (DA)',
      cell: (info) => <span className="font-bold tabular-nums text-slate-900">{formatMontant(info.getValue())}</span>,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (info) => {
        const isActive = info.row.original.isActive;
        const dateFin = info.row.original.dateFin;
        const isExpired = dateFin && new Date(dateFin) < new Date(new Date().setHours(0,0,0,0));

        if (!isActive) return <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">Désactivée</span>;
        if (isExpired) return <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-medium bg-red-100 text-red-700">Expirée</span>;
        
        return <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Active</span>;
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const ligne = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(ligne)} title={ligne.isActive ? "Désactiver" : "Activer"} className={ligne.isActive ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50" : "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"}>
              <Power size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(ligne)} className="text-slate-500 hover:text-indigo-600">
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
        <Button onClick={() => { 
          setEditingId(null); 
          setIsDialogOpen(true); 
          setTimeout(() => {
            const form = document.getElementById('ligneCreditForm') as HTMLFormElement;
            if(form) form.reset();
          }, 50);
        }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
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
                <TableRow key={row.id} className={!row.original.isActive ? "bg-slate-50/50 opacity-75" : ""}>
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
          <form id="ligneCreditForm" onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Montant (DA) *</label>
              <Input type="number" step="0.01" id="montant" name="montant" required placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date de début *</label>
                <Input type="date" id="dateCreation" name="dateCreation" required defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date de fin</label>
                <Input type="date" id="dateFin" name="dateFin" />
                <p className="text-[10px] text-slate-400 mt-1">Laissez vide si illimitée</p>
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