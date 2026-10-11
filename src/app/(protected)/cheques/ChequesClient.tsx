'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createCheque, updateCheque, deleteCheque, cancelCheque, reactivateCheque, getChequeDetails } from './actions';
import { previewExcelImport, confirmImport } from './import-actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { 
  Plus, Search, Edit2, Trash2, Loader2, FilterX, Download, Eye, Ban, 
  RotateCcw, AlertTriangle, Receipt, FileSignature, FileText, Upload, 
  AlertCircle, FileSpreadsheet, CheckCircle2, CircleDashed, Filter, ChevronsUpDown, Check
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

type Fournisseur = { id: string; nom: string; };

type Facture = { id: string; numero: string; fournisseurId: string; reste: number; montant: number; statut: string; };

type Cheque = { 
  id: string; numeroCheque: string; montant: number; reference: string | null; 
  dateCreation: Date; dateDecaissement: Date | null; type: string; statut: string; 
  fournisseurId: string; factureId?: string | null; fournisseur: { nom: string }; 
};

type Summary = {
  totalMontant: number; totalCount: number; totalApresSolde: number; countApresSolde: number; activeSoldeDate: Date | null;
};

export default function ChequesClient({
  initialData, summary, totalPages, currentPage, currentFilters, fournisseurs, factures, contrats
}: {
  initialData: Cheque[]; summary: Summary; total: number; totalPages: number; currentPage: number; currentFilters: any;
  fournisseurs: Fournisseur[]; factures: Facture[]; contrats: any[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States CRUD / Fiche
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFournisseur, setSelectedFournisseur] = useState('');
  const [selectedFacture, setSelectedFacture] = useState('');
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // States Filtres Avancés
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: currentFilters.search,
    fournisseurId: currentFilters.fournisseurId,
    factureId: currentFilters.factureId,
    contratId: currentFilters.contratId,
    statut: currentFilters.statut,
    dateEmissionDebut: currentFilters.dateEmissionDebut,
    dateEmissionFin: currentFilters.dateEmissionFin,
    dateEncaissementDebut: currentFilters.dateEncaissementDebut,
    dateEncaissementFin: currentFilters.dateEncaissementFin,
    montantMin: currentFilters.montantMin,
    montantMax: currentFilters.montantMax,
  });

  // States Import
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const formatMontant = (m: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(m);
  const formatDate = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR');

  // --- FILTRAGE INTELLIGENT (Formulaire) ---
  const handleFactureChange = (val: string) => {
    setSelectedFacture(val);
    if (val) {
      const f = factures.find(x => x.id === val);
      if (f) setSelectedFournisseur(f.fournisseurId);
    }
  };

  const handleFournisseurChange = (val: string) => {
    setSelectedFournisseur(val);
    if (selectedFacture) {
      const f = factures.find(x => x.id === selectedFacture);
      if (f && f.fournisseurId !== val) setSelectedFacture(''); 
    }
  };

  const filteredFactures = selectedFournisseur ? factures.filter(f => f.fournisseurId === selectedFournisseur) : factures;

  let maxMontant: number | undefined = undefined;
  if (selectedFacture) {
    const f = factures.find(x => x.id === selectedFacture);
    if (f) {
      maxMontant = f.reste;
      if (editingId) {
        const currentC = initialData.find(c => c.id === editingId);
        if (currentC && currentC.factureId === selectedFacture && currentC.statut !== 'ANNULE') {
          maxMontant += currentC.montant;
        }
      }
    }
  }

  // --- FILTRES PRO ACTIONS ---
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
    window.location.href = `/api/export/cheques?${params.toString()}`;
    toast.success("Exportation Pro démarrée");
  };

  // --- CRUD ACTIONS ---
  const openNew = () => {
    setEditingId(null); setSelectedFournisseur(''); setSelectedFacture(''); setIsDialogOpen(true);
    setTimeout(() => (document.getElementById('chequeForm') as HTMLFormElement)?.reset(), 50);
  };

  const openEdit = (cheque: Cheque) => {
    setEditingId(cheque.id);
    setSelectedFournisseur(cheque.fournisseurId);
    setSelectedFacture(cheque.factureId || '');
    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('numeroCheque') as HTMLInputElement).value = cheque.numeroCheque;
      (document.getElementById('montant') as HTMLInputElement).value = String(cheque.montant);
      (document.getElementById('reference') as HTMLInputElement).value = cheque.reference || '';
      (document.getElementById('commentaire') as HTMLInputElement).value = (cheque as any).commentaire || '';
      (document.getElementById('dateCreation') as HTMLInputElement).value = new Date(cheque.dateCreation).toISOString().split('T')[0];
      if (cheque.dateDecaissement) (document.getElementById('dateDecaissement') as HTMLInputElement).value = new Date(cheque.dateDecaissement).toISOString().split('T')[0];
      (document.getElementById('type') as HTMLSelectElement).value = cheque.type;
    }, 50);
  };

  const openDetails = async (id: string) => {
    setIsSheetOpen(true);
    setLoadingDetails(true);
    const data = await getChequeDetails(id);
    if (data) setDetails(data); else toast.error("Erreur de chargement");
    setLoadingDetails(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFournisseur) return toast.error("Veuillez sélectionner un fournisseur");
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append('fournisseurId', selectedFournisseur);
    if (selectedFacture) formData.append('factureId', selectedFacture);

    const res = editingId ? await updateCheque(editingId, formData) : await createCheque(formData);
    if (res.error) toast.error(res.error); else { toast.success("Enregistré"); setIsDialogOpen(false); }
    setLoading(false);
  };

  const handleCancelSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cancelId) return;
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const commentaire = formData.get('cancelCommentaire') as string;
    
    const res = await cancelCheque(cancelId, commentaire);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Chèque annulé avec succès");
      setIsCancelOpen(false);
      setCancelId(null);
    }
    setLoading(false);
  };

  const handleReactivate = async (id: string) => {
    if (!confirm("Voulez-vous vraiment réactiver ce chèque ?")) return;
    const res = await reactivateCheque(id);
    if (res.error) toast.error(res.error);
    else toast.success("Chèque réactivé");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce chèque de la base de données ?")) return;
    const res = await deleteCheque(id);
    if (res.error) toast.error(res.error);
    else toast.success("Chèque supprimé");
  };

  // --- IMPORT EXCEL ---
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
    if(fileInputRef.current) fileInputRef.current.value = ''; 
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

  // --- COLUMNS ---
  const columns: ColumnDef<typeof features, Cheque>[] = [
    { accessorKey: 'numeroCheque', header: 'N° Chèque', cell: (info) => <span className={`font-semibold ${info.row.original.statut === 'ANNULE' ? 'text-slate-400' : 'text-slate-900'}`}>{info.getValue() as string}</span> },
    { id: 'fournisseur', header: 'Fournisseur', cell: (info) => <span className="text-slate-700">{info.row.original.fournisseur.nom}</span> },
    { accessorKey: 'dateCreation', header: 'Date', cell: (info) => <span className="text-slate-600">{formatDate(info.getValue() as Date)}</span> },
    { accessorKey: 'montant', header: 'Montant', cell: (info) => <span className={`font-bold tabular-nums ${info.row.original.statut === 'ANNULE' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{formatMontant(info.getValue() as number)}</span> },
    {
      id: 'statut', header: 'Statut',
      cell: (info) => {
        const c = info.row.original;
        if (c.statut === 'ANNULE') return <span className="inline-flex px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200">Annulé</span>;
        if (c.statut === 'DECAISSE') return <span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">Décaissé</span>;
        return <span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">En circulation</span>;
      },
    },
    {
      id: 'actions', header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const c = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openDetails(c.id)} className="text-slate-500 hover:text-blue-600 bg-blue-50/50" title="Détails"><Eye size={16} /></Button>
            {c.statut === 'ANNULE' ? (
              <Button variant="ghost" size="icon" onClick={() => handleReactivate(c.id)} className="text-amber-500 hover:text-amber-600 hover:bg-amber-50" title="Réactiver"><RotateCcw size={16} /></Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => { setCancelId(c.id); setIsCancelOpen(true); }} className="text-red-400 hover:text-red-600 hover:bg-red-50" title="Annuler le chèque"><Ban size={16} /></Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="text-slate-500 hover:text-emerald-600" title="Modifier"><Edit2 size={16} /></Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} className="text-slate-500 hover:text-red-600" title="Supprimer définitivement"><Trash2 size={16} /></Button>
          </div>
        );
      },
    },
  ];

  const table = useTable({ features, data: initialData, columns });

  return (
    <div className="space-y-4">
      {/* 1. KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex items-center justify-between">
          <div><p className="text-slate-400 text-sm font-medium">Total de la sélection (Filtres)</p><p className="text-2xl font-bold tabular-nums mt-1">{formatMontant(summary.totalMontant)}</p></div>
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm">{summary.totalCount} chèque(s) trouvés</div>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm flex items-center justify-between">
          <div><p className="text-indigo-600 text-sm font-medium">Total APRÈS solde actuel</p><p className="text-2xl font-bold tabular-nums text-indigo-900 mt-1">{formatMontant(summary.totalApresSolde)}</p></div>
          <div className="bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-lg text-sm font-medium">{summary.countApresSolde} chèque(s)</div>
        </div>
      </div>

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
              <Plus size={18} className="mr-2" /> Nouveau
            </Button>
          </div>
        </div>

        {/* 3. PANNEAU DES FILTRES AVANCÉS */}
        {showFilters && (
          <div className="p-5 bg-indigo-50/30 border-b border-slate-200 animate-in slide-in-from-top-2">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Entités Liées</h4>
                  <FilterCombobox value={filters.fournisseurId} onChange={(v) => setFilters({...filters, fournisseurId: v})} items={fournisseurs.map(f => ({id: f.id, label: f.nom}))} placeholder="Filtrer par Fournisseur" />
                  <FilterCombobox value={filters.contratId} onChange={(v) => setFilters({...filters, contratId: v})} items={contrats.map(c => ({id: c.id, label: `Contrat N° ${c.numero}`}))} placeholder="Filtrer par Contrat" />
                  <FilterCombobox value={filters.factureId} onChange={(v) => setFilters({...filters, factureId: v})} items={factures.map(f => ({id: f.id, label: `Facture N° ${f.numero}`}))} placeholder="Filtrer par Facture" />
                </div>
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Critères Financiers</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Montant Min</label>
                      <Input type="number" placeholder="Min..." className="h-9 bg-white" value={filters.montantMin} onChange={(e) => setFilters({...filters, montantMin: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Montant Max</label>
                      <Input type="number" placeholder="Max..." className="h-9 bg-white" value={filters.montantMax} onChange={(e) => setFilters({...filters, montantMax: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Statut du Chèque</label>
                    <select value={filters.statut} onChange={(e) => setFilters({...filters, statut: e.target.value})} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500">
                      <option value="">Tous les statuts</option>
                      <option value="en_circulation">En circulation</option>
                      <option value="decaisse">Décaissé</option>
                      <option value="annule">Annulé</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-3 flex flex-col h-full">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Périodes</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Émission (Du)</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateEmissionDebut} onChange={(e) => setFilters({...filters, dateEmissionDebut: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Émission (Au)</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateEmissionFin} onChange={(e) => setFilters({...filters, dateEmissionFin: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Encaissement (Du)</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateEncaissementDebut} onChange={(e) => setFilters({...filters, dateEncaissementDebut: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Encaissement (Au)</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateEncaissementFin} onChange={(e) => setFilters({...filters, dateEncaissementFin: e.target.value})} />
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
                  <TableRow key={row.id} className={row.original.statut === 'ANNULE' ? "bg-red-50/30" : ""}>
                    {row.getAllCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun chèque trouvé.</TableCell></TableRow>
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

        {/* --- MODAL AJOUT / MODIF --- */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader><DialogTitle>{editingId ? 'Modifier le chèque' : 'Ajouter un chèque'}</DialogTitle></DialogHeader>
            <form id="chequeForm" onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <label className="block text-sm font-bold text-slate-900">1. Rattachement (Intelligent)</label>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Associer à une Facture (Optionnel)</label>
                  <select 
                    value={selectedFacture} onChange={(e) => handleFactureChange(e.target.value)} 
                    className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Sélectionner une facture (Toutes les factures non réglées)</option>
                    {filteredFactures.filter(f => f.statut !== 'PAYEE' || f.id === initialData.find(c=>c.id === editingId)?.factureId).map(f => (
                      <option key={f.id} value={f.id}>{f.numero} (Reste : {formatMontant(f.reste)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fournisseur *</label>
                  <select 
                    value={selectedFournisseur} onChange={(e) => handleFournisseurChange(e.target.value)} required
                    className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Sélectionner un fournisseur...</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° Chèque *</label>
                  <Input id="numeroCheque" name="numeroCheque" required placeholder="Ex: 1234567" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-900 mb-1 flex justify-between">
                    Montant (DA) * 
                    {maxMontant !== undefined && <span className="text-xs text-amber-600 font-medium">Max: {maxMontant}</span>}
                  </label>
                  <Input type="number" step="0.01" id="montant" name="montant" required max={maxMontant} placeholder="0.00" className={maxMontant !== undefined ? "border-amber-400 focus-visible:ring-amber-500" : "border-emerald-500"} />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date d&aposémission *</label>
                  <Input type="date" id="dateCreation" name="dateCreation" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date d&aposencaissement</label>
                  <Input type="date" id="dateDecaissement" name="dateDecaissement" />
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Commentaire (Optionnel)</label>
                <Input id="commentaire" name="commentaire" placeholder="Notes optionnelles..." />
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

        {/* --- MODAL d&aposaNNULATION --- */}
        <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Ban size={20}/> Annuler le chèque</DialogTitle></DialogHeader>
            <div className="bg-red-50 text-red-800 p-3 rounded-lg text-xs font-medium mt-2">
              Le montant de ce chèque sera soustrait du cumul fournisseur et de la facture associée.
            </div>
            <form onSubmit={handleCancelSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-bold text-slate-900 mb-1">Raison de l&aposannulation *</label>
                <Input id="cancelCommentaire" name="cancelCommentaire" required placeholder="Ex: Chèque refusé, erreur de montant..." />
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setIsCancelOpen(false)}>Fermer</Button>
                <Button type="submit" disabled={loading} className="bg-red-600 text-white hover:bg-red-700">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmer l&aposannulation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* --- MODAL IMPORTATION --- */}
        <Dialog open={isImportOpen} onOpenChange={(open) => {
          setIsImportOpen(open);
          if(!open) { setImportFile(null); setPreviewData(null); }
        }}>
          <DialogContent className="sm:max-w-[650px]">
            <DialogHeader><DialogTitle>Importer des chèques intelligents</DialogTitle></DialogHeader>
            {!previewData ? (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Instructions Excel :</p>
                    <ul className="list-disc ml-4 space-y-1 text-xs">
                      <li>Colonnes : N° Chèque | Fournisseur | N° Facture (Opt) | Montant | Date | Type | Réf | Encaissement</li>
                      <li>Le Fournisseur <strong className="font-bold">doit exister</strong>.</li>
                      <li>Si N° Facture est renseigné, elle doit appartenir à ce fournisseur.</li>
                    </ul>
                  </div>
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
                  <FileSpreadsheet size={40} className="mx-auto text-slate-400 mb-3" />
                  {loading ? (
                    <p className="text-slate-500 font-medium flex items-center justify-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyse...</p>
                  ) : (
                    <><p className="text-slate-700 font-medium">Cliquez ou glissez un fichier ici</p><p className="text-xs text-slate-400 mt-1">.xlsx</p></>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="text-emerald-600" />
                    <div><p className="font-medium text-slate-900">{importFile?.name}</p><p className="text-xs text-slate-500">{previewData.total} lignes analysées</p></div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setImportFile(null); setPreviewData(null); }}>Changer de fichier</Button>
                </div>
                {previewData.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-bold text-red-800 mb-2">{previewData.errors.length} erreur(s) bloquante(s) :</p>
                    <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto list-disc pl-4">
                      {previewData.errors.map((e: any, i: number) => <li key={i}>Ligne {e.line}: {e.message}</li>)}
                    </ul>
                  </div>
                )}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-sm text-emerald-800 font-medium">{previewData.validRows.length} chèque(s) prêt(s) à être importé(s).</p>
                </div>
                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setIsImportOpen(false)}>Annuler</Button>
                  <Button onClick={handleConfirmImport} disabled={previewData.validRows.length === 0 || importing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirmer l'importation
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* --- SHEET FICHE DÉTAILLÉE 360° --- */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-slate-50 p-0 border-l border-slate-200 shadow-2xl">
            {loadingDetails || !details ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
            ) : (
              <div className="flex flex-col h-full">
                <div className={`${details.statut === 'ANNULE' ? 'bg-red-900' : 'bg-slate-900'} text-white p-6 shrink-0 relative overflow-hidden`}>
                  <h2 className="text-2xl font-bold relative z-10 flex items-center gap-2">Chèque N° {details.numeroCheque}</h2>
                  <p className="text-slate-300 text-sm mt-1 mb-4 relative z-10">{details.fournisseur.nom}</p>
                  <p className={`text-3xl font-bold tabular-nums relative z-10 ${details.statut === 'ANNULE' ? 'line-through text-red-300' : 'text-emerald-400'}`}>
                    {formatMontant(details.montant)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 relative z-10">Émis le {formatDate(details.dateCreation)}</p>

                  {details.statut === 'ANNULE' && (
                    <div className="mt-4 p-3 bg-red-950/50 rounded-lg border border-red-500/30 text-xs">
                      <p className="font-bold text-red-300 flex items-center gap-1"><AlertTriangle size={14}/> ANNULÉ LE {formatDate(details.dateAnnulation)}</p>
                      <p className="text-red-100 mt-1 italic">"{details.commentaire}"</p>
                    </div>
                  )}
                </div>

                <div className="p-6 pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Informations & Rattachement</h3>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center text-sm"><span className="text-slate-500 font-medium">Type</span><span className="font-bold text-slate-900">{details.type === 'BANQUE' ? 'Banque' : 'Simple (Garantie)'}</span></div>
                    {details.reference && <div className="flex justify-between items-center text-sm"><span className="text-slate-500 font-medium">Référence</span><span className="font-bold text-slate-900">{details.reference}</span></div>}
                    {details.commentaire && details.statut !== 'ANNULE' && <div className="flex justify-between items-start text-sm"><span className="text-slate-500 font-medium">Commentaire</span><span className="text-slate-900 text-right w-2/3 italic">{details.commentaire}</span></div>}
                    <hr className="border-slate-100 my-2" />
                    {details.facture ? (
                      <div className="flex items-start gap-4">
                        <div className="bg-emerald-100 p-3 rounded-full text-emerald-600"><Receipt size={24}/></div>
                        <div>
                          <p className="text-xs text-slate-500 font-bold uppercase">Lié à la Facture</p>
                          <p className="text-sm font-bold text-slate-900">{details.facture.numero}</p>
                          {details.facture.bonCommande && <p className="text-[10px] text-blue-600 font-bold flex items-center gap-1 mt-1"><FileText size={10}/> BC N° {details.facture.bonCommande.numero}</p>}
                          {details.facture.contrat && <p className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 mt-1"><FileSignature size={10}/> Contrat N° {details.facture.contrat.numero}</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4">
                        <div className="bg-slate-100 p-3 rounded-full text-slate-500"><AlertTriangle size={24}/></div>
                        <div><p className="text-sm font-bold text-slate-500 mt-1">Chèque Libre</p><p className="text-xs text-slate-400">Aucune facture associée.</p></div>
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