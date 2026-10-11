'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBonCommande, updateBonCommande, deleteBonCommande, getBonCommandeDetails } from './actions';
import { previewBcImport, confirmBcImport } from './import-actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { 
  Plus, Search, Edit2, Trash2, Loader2, Eye, Receipt, FileText, 
  CheckCircle2, CircleDashed, FilterX, Download, Upload, 
  AlertCircle, FileSpreadsheet, Filter, ChevronsUpDown, Check 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

// --- COMPOSANT COMBOBOX POUR LA RECHERCHE ---
function FilterCombobox({ value, onChange, items, placeholder }: { value: string; onChange: (v: string) => void; items: {id: string, label: string}[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between h-9 bg-white text-slate-700 font-normal">
          <span className="truncate">{value ? items.find((i) => i.id === value)?.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher..." />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem key={item.id} value={item.label} onSelect={() => { onChange(item.id === value ? "" : item.id); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 shrink-0 ${value === item.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const features = tableFeatures({});

type BC = {
  id: string; numero: string; designation?: string; date: Date; montant: number;
  fournisseurId: string; fournisseur: { nom: string };
  _count: { factures: number };
};

export default function BonsCommandesClient({
  initialData, totalPages, currentPage, currentFilters, fournisseurs, summary
}: {
  initialData: BC[]; total: number; totalPages: number; currentPage: number; currentFilters?: any;
  fournisseurs: { id: string; nom: string }[]; summary?: any;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States CRUD
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFournisseur, setSelectedFournisseur] = useState('');

  // States Fiche Détaillée
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [bcDetails, setBcDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // States Filtres Avancés
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: currentFilters?.search || '',
    fournisseurId: currentFilters?.fournisseurId || '',
    dateDebutMin: currentFilters?.dateDebutMin || '',
    dateDebutMax: currentFilters?.dateDebutMax || '',
    montantMin: currentFilters?.montantMin || '',
    montantMax: currentFilters?.montantMax || '',
  });

  // States Import
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const formatMontant = (m: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(m);
  const formatDate = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR');

  // --- ACTIONS FILTRES ET EXPORT ---
  const applyFilters = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value as string); });
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const resetFilters = () => {
    const emptyFilters = Object.keys(filters).reduce((acc, key) => ({ ...acc, [key]: '' }), {});
    setFilters(emptyFilters as any);
    router.push('?page=1');
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value as string); });
    window.location.href = `/api/export/bons-commande?${params.toString()}`;
    toast.success("Exportation Pro démarrée");
  };

  // --- ACTIONS IMPORT EXCEL ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    
    const result = await previewBcImport(formData);
    if (result.error) { toast.error(result.error); setImportFile(null); } 
    else { setPreviewData(result); }
    setLoading(false);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    if (!previewData?.validRows.length) return;
    setImporting(true);
    const result = await confirmBcImport(previewData.validRows);
    
    if (result.dbErrors?.length) toast.warning(`${result.successCount} ajoutés, ${result.dbErrors.length} erreurs`);
    else toast.success(`${result.successCount} Bons de Commande importés avec succès !`);
    
    setIsImportOpen(false); setImportFile(null); setPreviewData(null); setImporting(false);
  };

  // --- ACTIONS CRUD ---
  const openNew = () => {
    setEditingId(null); setSelectedFournisseur(''); setIsDialogOpen(true);
    setTimeout(() => (document.getElementById('bcForm') as HTMLFormElement)?.reset(), 50);
  };

  const openEdit = (bonCommande: BC) => {
  setEditingId(bonCommande.id);
  setSelectedFournisseur(bonCommande.fournisseurId);
  setIsDialogOpen(true);

  setTimeout(() => {
    (document.getElementById('numero') as HTMLInputElement).value =
      bonCommande.numero;

    (document.getElementById('designation') as HTMLInputElement).value =
      bonCommande.designation || '';

    (document.getElementById('date') as HTMLInputElement).value =
      new Date(bonCommande.date).toISOString().split('T')[0];

    (document.getElementById('montant') as HTMLInputElement).value =
      String(bonCommande.montant);
  }, 50);
};

  const openDetails = async (id: string) => {
    setIsSheetOpen(true);
    setLoadingDetails(true);
    const details = await getBonCommandeDetails(id);
    if (details) setBcDetails(details);
    else toast.error("Erreur lors du chargement des détails");
    setLoadingDetails(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(!selectedFournisseur && !editingId) return toast.error("Veuillez sélectionner un fournisseur");
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (!editingId) formData.append('fournisseurId', selectedFournisseur);

    const res = editingId ? await updateBonCommande(editingId, formData) : await createBonCommande(formData);

    if (res.error) toast.error(res.error);
    else {
      toast.success(editingId ? "Bon de commande modifié" : "Bon de commande ajouté");
      setIsDialogOpen(false); setEditingId(null);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce BC ? TOUTES les factures associées seront supprimées.")) return;
    const res = await deleteBonCommande(id);
    if (res.error) toast.error(res.error); else toast.success("Bon de commande supprimé");
  };

  const columns: ColumnDef<typeof features, BC>[] = [
    { accessorKey: 'numero', header: 'N° BC', cell: (info) => <span className="font-bold text-slate-900">{info.getValue() as string}</span> },
    { accessorKey: 'date', header: 'Date', cell: (info) => <span className="text-slate-600">{formatDate(info.getValue() as Date)}</span> },
    { id: 'fournisseur', header: 'Fournisseur', cell: (info) => <span className="font-medium text-slate-700">{info.row.original.fournisseur.nom}</span> },
    { accessorKey: 'montant', header: 'Montant', cell: (info) => <span className="font-bold tabular-nums text-slate-900">{formatMontant(info.getValue() as number)}</span> },
    { 
      id: 'factures', header: 'Factures', 
      cell: (info) => (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium border border-slate-200">
          <Receipt size={12} /> {info.row.original._count.factures}
        </span>
      )
    },
    {
      id: 'actions', header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const bc = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openDetails(bc.id)} className="text-slate-500 hover:text-blue-600 bg-blue-50/50"><Eye size={16} /></Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(bc)} className="text-slate-500 hover:text-emerald-600"><Edit2 size={16} /></Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(bc.id)} className="text-slate-500 hover:text-red-600"><Trash2 size={16} /></Button>
          </div>
        );
      },
    },
  ];

  const table = useTable({ features, data: initialData, columns });

  return (
    <div className="space-y-4">

      {/* 1. KPIs */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex items-center justify-between">
            <div><p className="text-slate-400 text-sm font-medium">Total de la sélection (Montant)</p><p className="text-2xl font-bold tabular-nums mt-1">{formatMontant(summary.totalMontant)}</p></div>
            <div className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm">{summary.totalCount} BC trouvés</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* 2. BARRE OUTILS & RECHERCHE */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <form onSubmit={(e) => { e.preventDefault(); applyFilters(); }} className="relative w-full md:w-96 flex gap-2">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <Input value={filters.search} onChange={(e) => setFilters({...filters, search: e.target.value})} placeholder="Recherche rapide (N°)..." className="pl-10 h-10 bg-white" />
             </div>
             <Button type="button" onClick={() => setShowFilters(!showFilters)} variant="outline" className={`h-10 text-slate-600 transition-colors ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white'}`}>
                <Filter size={16} className="mr-2" /> Filtres Pro
             </Button>
          </form>

          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Button onClick={handleExport} variant="outline" className="bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 h-10">
              <Download size={16} className="mr-2" /> Export Pro
            </Button>
            <Button onClick={() => setIsImportOpen(true)} variant="outline" className="bg-white h-10">
              <Upload size={16} className="mr-2" /> Importer
            </Button>
            <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white h-10">
              <Plus size={18} className="mr-2" /> Nouveau BC
            </Button>
          </div>
        </div>

        {/* 3. PANNEAU DES FILTRES AVANCÉS */}
        {showFilters && (
          <div className="p-5 bg-indigo-50/30 border-b border-slate-200 animate-in slide-in-from-top-2">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fournisseur</h4>
                  <FilterCombobox value={filters.fournisseurId} onChange={(v) => setFilters({...filters, fournisseurId: v})} items={fournisseurs.map(f => ({id: f.id, label: f.nom}))} placeholder="Filtrer par Fournisseur" />
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Montants</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Min (DA)</label>
                      <Input type="number" placeholder="Min..." className="h-9 bg-white" value={filters.montantMin} onChange={(e) => setFilters({...filters, montantMin: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Max (DA)</label>
                      <Input type="number" placeholder="Max..." className="h-9 bg-white" value={filters.montantMax} onChange={(e) => setFilters({...filters, montantMax: e.target.value})} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 flex flex-col h-full">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dates de création</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Du</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateDebutMin} onChange={(e) => setFilters({...filters, dateDebutMin: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Au</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateDebutMax} onChange={(e) => setFilters({...filters, dateDebutMax: e.target.value})} />
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-auto pt-2">
                     <Button onClick={applyFilters} className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 flex-1">Appliquer l&aposanalyse</Button>
                     <Button onClick={resetFilters} variant="outline" size="icon" title="Réinitialiser" className="h-9 w-10 shrink-0 bg-white"><FilterX size={16} /></Button>
                  </div>
                </div>

             </div>
          </div>
        )}

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
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun bon de commande ne correspond à ces critères.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* 4. PAGINATION */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
            <div>Page {currentPage} sur {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={currentPage <= 1} onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('page', String(currentPage - 1));
                router.push(`?${params.toString()}`);
              }}>Précédent</Button>
              <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('page', String(currentPage + 1));
                router.push(`?${params.toString()}`);
              }}>Suivant</Button>
            </div>
          </div>
        )}

        {/* ----------------- MODAL CRUD ----------------- */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>{editingId ? 'Modifier le BC' : 'Ajouter un Bon de Commande'}</DialogTitle></DialogHeader>
            <form id="bcForm" onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° BC *</label>
                  <Input id="numero" name="numero" required placeholder="BC-2026-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                  <Input type="date" id="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
              </div>
              
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur *</label>
                  <FilterCombobox value={selectedFournisseur} onChange={setSelectedFournisseur} items={fournisseurs.map(f => ({id: f.id, label: f.nom}))} placeholder="Sélectionner..." />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant (DA) *</label>
                <Input type="number" step="0.01" id="montant" name="montant" required placeholder="0.00" className="border-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Désignation / Description</label>
                <Input id="designation" name="designation" placeholder="Achat de matériel..." />
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enregistrer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* --- MODAL IMPORTATION --- */}
        <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if(!open) { setImportFile(null); setPreviewData(null); } }}>
          <DialogContent className="sm:max-w-[650px]">
            <DialogHeader><DialogTitle>Importer des BC (Smart Import)</DialogTitle></DialogHeader>
            {!previewData ? (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Structure Excel :</p>
                    <ul className="list-disc ml-4 space-y-1 text-xs">
                      <li>Colonnes: N° BC | Fournisseur | Date | Montant | Désignation</li>
                      <li>Le Fournisseur <strong className="font-bold">doit exister</strong> dans la base de données.</li>
                    </ul>
                  </div>
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
                  <FileSpreadsheet size={40} className="mx-auto text-slate-400 mb-3" />
                  {loading ? <p className="text-slate-500 font-medium flex items-center justify-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyse...</p> : <><p className="text-slate-700 font-medium">Glissez un fichier ici</p><p className="text-xs text-slate-400 mt-1">.xlsx</p></>}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3"><FileSpreadsheet className="text-emerald-600" /><div><p className="font-medium text-slate-900">{importFile?.name}</p><p className="text-xs text-slate-500">{previewData.total} lignes analysées</p></div></div>
                  <Button variant="ghost" size="sm" onClick={() => { setImportFile(null); setPreviewData(null); }}>Changer</Button>
                </div>
                {previewData.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-bold text-red-800 mb-2">{previewData.errors.length} erreur(s) bloquante(s) :</p>
                    <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto list-disc pl-4">{previewData.errors.map((e: any, i: number) => <li key={i}>Ligne {e.line}: {e.message}</li>)}</ul>
                  </div>
                )}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4"><p className="text-sm text-emerald-800 font-medium">{previewData.validRows.length} BC valide(s).</p></div>
                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setIsImportOpen(false)}>Annuler</Button>
                  <Button onClick={handleConfirmImport} disabled={previewData.validRows.length === 0 || importing} className="bg-emerald-600 hover:bg-emerald-700 text-white">{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Importer</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ----------------- SHEET FICHE DÉTAILLÉE ----------------- */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-slate-50 p-0">
            {loadingDetails || !bcDetails ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Header de la Fiche */}
                <div className="bg-slate-900 text-white p-6 shrink-0">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold flex items-center gap-2"><FileText size={24}/> BC N° {bcDetails.numero}</h2>
                      <p className="text-slate-400 text-sm mt-1">{bcDetails.fournisseur.nom}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold tabular-nums text-emerald-400">{formatMontant(bcDetails.montant)}</p>
                      <p className="text-xs text-slate-400 mt-1">Émis le {formatDate(bcDetails.date)}</p>
                    </div>
                  </div>
                  {bcDetails.designation && <p className="text-sm bg-slate-800 p-2 rounded text-slate-300 mb-4">{bcDetails.designation}</p>}
                  
                  {/* Barre de progression (Paiement) */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span>État du paiement ({bcDetails.pourcentageGlobal.toFixed(2)}%)</span>
                      <span>Reste: {formatMontant(bcDetails.montant - bcDetails.totalPaye)}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div className={`h-2 rounded-full ${bcDetails.statutGlobal === 'PAYEE' ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${bcDetails.pourcentageGlobal}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* Liste des Factures et Chèques */}
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Receipt size={20} className="text-slate-500"/> Factures associées ({bcDetails.factures.length})
                    </h3>
                    
                    {bcDetails.factures.length === 0 ? (
                      <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
                        Aucune facture rattachée à ce bon de commande pour le moment.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {bcDetails.factures.map((facture: any) => (
                          <div key={facture.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                              <div>
                                <p className="font-bold text-slate-900">{facture.numero}</p>
                                <p className="text-xs text-slate-500">{facture.designation || 'Sans désignation'}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold tabular-nums text-slate-900">{formatMontant(facture.montant)}</p>
                                <span className={`inline-flex px-2 py-0.5 mt-1 rounded text-[10px] font-medium ${
                                  facture.statut === 'PAYEE' ? 'bg-emerald-100 text-emerald-800' : 
                                  facture.statut === 'PARTIELLEMENT_PAYEE' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {facture.statut.replace('_', ' ')} ({facture.pourcentage}%)
                                </span>
                              </div>
                            </div>

                            {/* Chèques de cette facture */}
                            {facture.cheques.length > 0 ? (
                              <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-bold text-slate-600 mb-2 uppercase">Chèques associés :</p>
                                {facture.cheques.map((cheque: any) => (
                                  <div key={cheque.id} className="flex justify-between items-center text-sm border-l-2 border-emerald-500 pl-3">
                                    <div className="flex flex-col">
                                      <span className="font-medium text-slate-800">Chèque N° {cheque.numeroCheque}</span>
                                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                        {cheque.statut === 'ANNULE' ? <CircleDashed size={10} className="text-red-500"/> : <CheckCircle2 size={10} className="text-emerald-500"/>}
                                        {cheque.statut} - {formatDate(cheque.dateCreation)}
                                      </span>
                                    </div>
                                    <span className={`font-bold tabular-nums ${cheque.statut === 'ANNULE' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                      {formatMontant(Number(cheque.montant))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 italic">Aucun règlement effectué sur cette facture.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}