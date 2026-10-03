'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createCheque, updateCheque, deleteCheque } from './actions';
import { previewExcelImport, confirmImport } from './import-actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { Plus, Search, Edit2, Trash2, Loader2, Check, ChevronsUpDown, FilterX, Download, Upload, AlertCircle, FileSpreadsheet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const features = tableFeatures({});

type Fournisseur = { id: string; nom: string; };

type Cheque = {
  id: string;
  numeroCheque: string;
  montant: any;
  reference: string | null;
  dateCreation: Date;
  dateDecaissement: Date | null;
  type: string;
  fournisseurId: string;
  fournisseur: { nom: string };
};

type Summary = {
  totalMontant: number;
  totalCount: number;
  totalApresSolde: number;
  countApresSolde: number;
  activeSoldeDate: Date | null;
};

export default function ChequesClient({
  initialData, summary, totalPages, currentPage, currentFilters, fournisseurs
}: {
  initialData: Cheque[];
  summary: Summary;
  total: number;
  totalPages: number;
  currentPage: number;
  currentFilters: { search: string; fournisseurId: string; statut: string };
  fournisseurs: Fournisseur[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFournisseur, setSelectedFournisseur] = useState<string>('');
  const [openCombobox, setOpenCombobox] = useState(false);

  const [filterSearch, setFilterSearch] = useState(currentFilters.search);
  const [filterFournisseur, setFilterFournisseur] = useState(currentFilters.fournisseurId);
  const [filterStatut, setFilterStatut] = useState(currentFilters.statut);

  // States pour l'Import
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const formatMontant = (montant: any) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(Number(montant));
  const formatDate = (date: Date) => new Date(date).toLocaleDateString('fr-FR');

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (filterSearch) params.set('search', filterSearch);
    if (filterFournisseur) params.set('fournisseurId', filterFournisseur);
    if (filterStatut) params.set('statut', filterStatut);
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const resetFilters = () => {
    setFilterSearch('');
    setFilterFournisseur('');
    setFilterStatut('');
    router.push('?page=1');
  };

  const openEdit = (cheque: Cheque) => {
    setEditingId(cheque.id);
    setSelectedFournisseur(cheque.fournisseurId);
    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('numeroCheque') as HTMLInputElement).value = cheque.numeroCheque;
      (document.getElementById('montant') as HTMLInputElement).value = String(cheque.montant);
      (document.getElementById('reference') as HTMLInputElement).value = cheque.reference || '';
      (document.getElementById('dateCreation') as HTMLInputElement).value = new Date(cheque.dateCreation).toISOString().split('T')[0];
      if (cheque.dateDecaissement) {
        (document.getElementById('dateDecaissement') as HTMLInputElement).value = new Date(cheque.dateDecaissement).toISOString().split('T')[0];
      }
      (document.getElementById('type') as HTMLSelectElement).value = cheque.type;
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFournisseur) {
      toast.error("Veuillez sélectionner un fournisseur");
      return;
    }
    
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append('fournisseurId', selectedFournisseur);

    const res = editingId 
      ? await updateCheque(editingId, formData)
      : await createCheque(formData);

    if (res.error) toast.error(res.error);
    else {
      toast.success(editingId ? "Chèque modifié" : "Chèque ajouté");
      setIsDialogOpen(false);
      setEditingId(null);
      setSelectedFournisseur('');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce chèque ?")) return;
    const res = await deleteCheque(id);
    if (res.error) toast.error(res.error);
    else toast.success("Chèque supprimé");
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterSearch) params.set('search', filterSearch);
    if (filterFournisseur) params.set('fournisseurId', filterFournisseur);
    if (filterStatut) params.set('statut', filterStatut);
    
    const url = `/api/export/cheques?${params.toString()}`;
    window.location.href = url;
    toast.success("Exportation démarrée");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    
    const result = await previewExcelImport(formData);
    if (result.error) {
      toast.error(result.error);
      setImportFile(null);
    } else {
      setPreviewData(result);
    }
    setLoading(false);
  };

  const handleConfirmImport = async () => {
    if (!previewData?.validRows.length) return;
    setImporting(true);
    
    const result = await confirmImport(previewData.validRows);
    
    if (result.dbErrors?.length) {
      toast.warning(`${result.successCount} ajoutés, ${result.dbErrors.length} erreurs`);
    } else {
      toast.success(`${result.successCount} chèques importés avec succès !`);
    }
    
    setIsImportOpen(false);
    setImportFile(null);
    setPreviewData(null);
    setImporting(false);
  };

  const columns: ColumnDef<typeof features, Cheque>[] = [
    {
      accessorKey: 'numeroCheque',
      header: 'N° Chèque',
      cell: (info) => <span className="font-semibold text-slate-900">{info.getValue() as string}</span>,
    },
    {
      id: 'fournisseur',
      header: 'Fournisseur',
      cell: (info) => <span className="text-slate-700">{info.row.original.fournisseur.nom}</span>,
    },
    {
      accessorKey: 'dateCreation',
      header: 'Date Création',
      cell: (info) => <span className="text-slate-600">{formatDate(info.getValue() as Date)}</span>,
    },
    {
      accessorKey: 'montant',
      header: 'Montant',
      cell: (info) => <span className="font-bold tabular-nums text-slate-900">{formatMontant(info.getValue())}</span>,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (info) => {
        const decaisse = info.row.original.dateDecaissement;
        return decaisse ? (
          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Décaissé le {formatDate(decaisse)}
          </span>
        ) : (
          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            En circulation
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const cheque = info.row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(cheque)} className="text-slate-500 hover:text-emerald-600">
              <Edit2 size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(cheque.id)} className="text-slate-500 hover:text-red-600">
              <Trash2 size={16} />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useTable({ features, data: initialData, columns });

  return (
    <div className="space-y-4">
      {/* 1. الشريط اللصوق للإحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm font-medium">Total de la sélection</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{formatMontant(summary.totalMontant)}</p>
          </div>
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm">
            {summary.totalCount} chèque(s)
          </div>
        </div>
        
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-indigo-600 text-sm font-medium">Total APRÈS solde actuel</p>
            <p className="text-2xl font-bold tabular-nums text-indigo-900 mt-1">{formatMontant(summary.totalApresSolde)}</p>
            {summary.activeSoldeDate && (
              <p className="text-xs text-indigo-400 mt-1">Solde du: {formatDate(summary.activeSoldeDate)}</p>
            )}
          </div>
          <div className="bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-lg text-sm font-medium">
            {summary.countApresSolde} chèque(s)
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* 2. شريط الفلاتر المتقدم + أزرار الاستيراد والتصدير */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-48">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Recherche (N°)</label>
            <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="N° Chèque..." className="bg-white" />
          </div>
          
          <div className="w-full sm:w-64">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Fournisseur</label>
            <select 
              value={filterFournisseur} 
              onChange={(e) => setFilterFournisseur(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Tous les fournisseurs</option>
              {fournisseurs.map(f => (
                <option key={f.id} value={f.id}>{f.nom}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-48">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Statut</label>
            <select 
              value={filterStatut} 
              onChange={(e) => setFilterStatut(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Tous les statuts</option>
              <option value="en_circulation">En circulation</option>
              <option value="decaisse">Décaissé</option>
            </select>
          </div>

          <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <Button onClick={applyFilters} className="bg-slate-900 text-white">Filtrer</Button>
            <Button onClick={resetFilters} variant="outline" size="icon" title="Réinitialiser"><FilterX size={16} /></Button>
          </div>
          
          <div className="flex flex-wrap gap-2 ml-auto mt-4 lg:mt-0">
            <Button onClick={handleExport} variant="outline" className="bg-white">
              <Download size={16} className="mr-2" /> Exporter
            </Button>
            <Button onClick={() => setIsImportOpen(true)} variant="outline" className="bg-white">
              <Upload size={16} className="mr-2" /> Importer
            </Button>
            <Button onClick={() => { 
              setEditingId(null); 
              setSelectedFournisseur(''); 
              setIsDialogOpen(true); 
              setTimeout(() => {
                const form = document.getElementById('chequeForm') as HTMLFormElement;
                if(form) form.reset();
              }, 50);
            }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus size={18} className="mr-2" /> Nouveau Chèque
            </Button>
          </div>
        </div>

        {/* 3. الجدول */}
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
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun chèque trouvé.</TableCell></TableRow>
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

        {/* Modal CRUD */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Modifier le chèque' : 'Ajouter un chèque'}</DialogTitle>
            </DialogHeader>
            <form id="chequeForm" onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° Chèque *</label>
                  <Input id="numeroCheque" name="numeroCheque" required placeholder="Ex: 1234567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Montant (DA) *</label>
                  <Input type="number" step="0.01" id="montant" name="montant" required placeholder="0.00" />
                </div>
              </div>
              
              <div className="flex flex-col">
                <label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur *</label>
                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={openCombobox} className="justify-between w-full font-normal">
                      {selectedFournisseur ? fournisseurs.find((f) => f.id === selectedFournisseur)?.nom : "Sélectionner un fournisseur..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Rechercher..." />
                      <CommandList>
                        <CommandEmpty>Aucun fournisseur trouvé.</CommandEmpty>
                        <CommandGroup>
                          {fournisseurs.map((f) => (
                            <CommandItem
                              key={f.id}
                              value={f.nom}
                              onSelect={() => {
                                setSelectedFournisseur(f.id);
                                setOpenCombobox(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${selectedFournisseur === f.id ? "opacity-100" : "opacity-0"}`} />
                              {f.nom}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date d'émission *</label>
                  <Input type="date" id="dateCreation" name="dateCreation" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date d'encaissement (Banque)</label>
                  <Input type="date" id="dateDecaissement" name="dateDecaissement" />
                  <p className="text-[10px] text-slate-400 mt-1">Laissez vide si "En circulation"</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type de chèque</label>
                  <select id="type" name="type" className="w-full h-10 rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                    <option value="BANQUE">Banque (Normal)</option>
                    <option value="SIMPLE">Simple (Garantie)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Référence (Optionnel)</label>
                  <Input id="reference" name="reference" placeholder="Facture N°..." />
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

        {/* Modal d'Importation */}
        <Dialog open={isImportOpen} onOpenChange={(open) => {
          setIsImportOpen(open);
          if(!open) { setImportFile(null); setPreviewData(null); }
        }}>
          <DialogContent className="sm:max-w-[650px]">
            <DialogHeader>
              <DialogTitle>Importer des chèques (Excel)</DialogTitle>
            </DialogHeader>
            
            {!previewData ? (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Instructions :</p>
                    <ul className="list-disc ml-4 space-y-1">
                      <li>Colonnes attendues : N° Chèque, Fournisseur, Montant, Date Emission, Type, Référence, Date Encaissement.</li>
                      <li>Le "Fournisseur" <strong className="font-bold">doit exister</strong> dans la base de données.</li>
                    </ul>
                  </div>
                </div>
                
                <div 
                  className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
                  <FileSpreadsheet size={40} className="mx-auto text-slate-400 mb-3" />
                  {loading ? (
                    <p className="text-slate-500 font-medium flex items-center justify-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyse en cours...
                    </p>
                  ) : (
                    <>
                      <p className="text-slate-700 font-medium">Cliquez ou glissez un fichier ici</p>
                      <p className="text-xs text-slate-400 mt-1">Formats supportés: .xlsx</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="text-emerald-600" />
                    <div>
                      <p className="font-medium text-slate-900">{importFile?.name}</p>
                      <p className="text-xs text-slate-500">{previewData.total} lignes analysées</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setImportFile(null); setPreviewData(null); }}>
                    Changer de fichier
                  </Button>
                </div>

                {previewData.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-bold text-red-800 mb-2">{previewData.errors.length} erreur(s) trouvée(s) :</p>
                    <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto list-disc pl-4">
                      {previewData.errors.map((e: any, i: number) => (
                        <li key={i}>Ligne {e.line}: {e.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex justify-between items-center">
                  <p className="text-sm text-emerald-800 font-medium">
                    {previewData.validRows.length} chèque(s) prêt(s) à être importé(s).
                  </p>
                </div>

                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setIsImportOpen(false)}>Annuler</Button>
                  <Button 
                    onClick={handleConfirmImport} 
                    disabled={previewData.validRows.length === 0 || importing}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirmer l'importation
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}