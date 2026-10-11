'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createContrat, updateContrat, deleteContrat, renewContrat, getContratDetails } from './actions';
import { previewContratImport, confirmContratImport } from './import-actions'; // راح نكرييوه مبعد
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { 
  Plus, Search, Edit2, Trash2, Loader2, Eye, RefreshCw, AlertTriangle, 
  FileSignature, Receipt, CheckCircle2, CircleDashed, FilterX, Download, 
  Upload, AlertCircle, FileSpreadsheet, Filter, ChevronsUpDown, Check, Info
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

type Contrat = {
  id: string; numero: string; designation?: string; date: Date; dateFin?: Date | null; montant: number;
  montantConsommeInitial: number; // 💡 تمت إضافته
  seuil: number; seuilActive: boolean; isActive: boolean;
  fournisseurId: string; fournisseur: { nom: string };
  _count: { factures: number }; parent?: { numero: string };
};

export default function ContratsClient({
  initialData, totalPages, currentPage, currentFilters, fournisseurs, summary
}: {
  initialData: Contrat[]; total: number; totalPages: number; currentPage: number; currentFilters: any;
  fournisseurs: { id: string; nom: string }[]; summary?: any;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States CRUD
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hasSeuil, setHasSeuil] = useState(false);
  const [selectedFournisseur, setSelectedFournisseur] = useState('');

  // States Modal Renew
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewOldNum, setRenewOldNum] = useState<string>('');

  // States Sheet (Fiche détaillée)
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // States Filtres Avancés
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: currentFilters?.search || '',
    fournisseurId: currentFilters?.fournisseurId || '',
    statut: currentFilters?.statut || '',
    dateDebutMin: currentFilters?.dateDebutMin || '',
    dateDebutMax: currentFilters?.dateDebutMax || '',
    montantMin: currentFilters?.montantMin || '',
    montantMax: currentFilters?.montantMax || '',
    avecSeuil: currentFilters?.avecSeuil || '',
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
    window.location.href = `/api/export/contrats?${params.toString()}`;
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
    
    const result = await previewContratImport(formData);
    if (result.error) { toast.error(result.error); setImportFile(null); } 
    else { setPreviewData(result); }
    setLoading(false);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    if (!previewData?.validRows.length) return;
    setImporting(true);
    const result = await confirmContratImport(previewData.validRows);
    
    if (result.dbErrors?.length) toast.warning(`${result.successCount} ajoutés, ${result.dbErrors.length} erreurs`);
    else toast.success(`${result.successCount} contrats importés avec succès !`);
    
    setIsImportOpen(false); setImportFile(null); setPreviewData(null); setImporting(false);
  };

  // --- ACTIONS CRUD ---
  const openNew = () => {
    setEditingId(null); setSelectedFournisseur(''); setHasSeuil(false); setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('contratForm') as HTMLFormElement)?.reset();
      (document.getElementById('montantConsommeInitial') as HTMLInputElement).value = '0';
    }, 50);
  };

  const openEdit = (c: Contrat) => {
    setEditingId(c.id);
    setSelectedFournisseur(c.fournisseurId);
    setHasSeuil(c.seuilActive);
    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('numero') as HTMLInputElement).value = c.numero;
      (document.getElementById('designation') as HTMLInputElement).value = c.designation || '';
      (document.getElementById('date') as HTMLInputElement).value = new Date(c.date).toISOString().split('T')[0];
      if (c.dateFin) (document.getElementById('dateFin') as HTMLInputElement).value = new Date(c.dateFin).toISOString().split('T')[0];
      (document.getElementById('montant') as HTMLInputElement).value = String(c.montant);
      (document.getElementById('montantConsommeInitial') as HTMLInputElement).value = String(c.montantConsommeInitial || 0); // 💡 تعبئة الاستهلاك الأولي
      if (c.seuilActive) (document.getElementById('seuil') as HTMLInputElement).value = String(c.seuil || '');
    }, 50);
  };

  const openRenew = (c: Contrat) => {
    setRenewingId(c.id);
    setRenewOldNum(c.numero);
    setHasSeuil(false);
    setIsRenewOpen(true);
    setTimeout(() => {
      (document.getElementById('renewForm') as HTMLFormElement)?.reset();
      (document.getElementById('renewMontantConsommeInitial') as HTMLInputElement).value = '0';
    }, 50);
  };

  const openDetails = async (id: string) => {
    setIsSheetOpen(true);
    setLoadingDetails(true);
    const data = await getContratDetails(id);
    if (data) setDetails(data); else toast.error("Erreur de chargement");
    setLoadingDetails(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(!selectedFournisseur && !editingId) return toast.error("Veuillez sélectionner un fournisseur");
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (!editingId) formData.append('fournisseurId', selectedFournisseur);

    const res = editingId ? await updateContrat(editingId, formData) : await createContrat(formData);
    if (res.error) toast.error(res.error);
    else { toast.success(editingId ? "Contrat modifié" : "Contrat ajouté"); setIsDialogOpen(false); setEditingId(null); }
    setLoading(false);
  };

  const handleRenewSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!renewingId) return;
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await renewContrat(renewingId, formData);

    if (res.error) toast.error(res.error);
    else { toast.success("Contrat renouvelé avec succès"); setIsRenewOpen(false); setRenewingId(null); }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce contrat ? TOUTES les factures associées seront supprimées.")) return;
    const res = await deleteContrat(id);
    if (res.error) toast.error(res.error); else toast.success("Contrat supprimé");
  };

  // --- COLONNES ---
  const columns: ColumnDef<typeof features, Contrat>[] = [
    { 
      accessorKey: 'numero', header: 'N° Contrat', 
      cell: (info) => (
        <div className="flex flex-col">
          <span className={`font-bold ${!info.row.original.isActive ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{info.getValue() as string}</span>
          {info.row.original.parent && <span className="text-[10px] text-emerald-600">Renouv. de {info.row.original.parent.numero}</span>}
        </div>
      )
    },
    { id: 'fournisseur', header: 'Fournisseur', cell: (info) => <span className="font-medium text-slate-700">{info.row.original.fournisseur.nom}</span> },
    { accessorKey: 'montant', header: 'Montant', cell: (info) => <span className="font-bold tabular-nums text-slate-900">{formatMontant(info.getValue() as number)}</span> },
    { 
      id: 'seuil', header: 'Seuil', 
      cell: (info) => {
        const c = info.row.original;
        if (!c.seuilActive) return <span className="text-xs text-slate-400 italic">-</span>;
        return <span className="font-semibold text-amber-600 text-sm">{formatMontant(c.seuil)}</span>;
      }
    },
    {
      id: 'statut', header: 'Statut',
      cell: (info) => info.row.original.isActive 
        ? <span className="inline-flex px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-bold">Actif</span>
        : <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold">Ancien</span>
    },
    {
      id: 'actions', header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const c = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openDetails(c.id)} className="text-slate-500 hover:text-blue-600 bg-blue-50/50" title="Détails 360°"><Eye size={16} /></Button>
            {c.isActive && (
              <Button variant="ghost" size="icon" onClick={() => openRenew(c)} className="text-slate-500 hover:text-amber-600" title="Renouveler"><RefreshCw size={16} /></Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="text-slate-500 hover:text-emerald-600" title="Modifier"><Edit2 size={16} /></Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} className="text-slate-500 hover:text-red-600"><Trash2 size={16} /></Button>
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
            <div className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm">{summary.totalCount} contrat(s)</div>
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
              <Plus size={18} className="mr-2" /> Nouveau Contrat
            </Button>
          </div>
        </div>

        {/* 3. PANNEAU DES FILTRES AVANCÉS */}
        {showFilters && (
          <div className="p-5 bg-indigo-50/30 border-b border-slate-200 animate-in slide-in-from-top-2">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Entités & Statut</h4>
                  <FilterCombobox value={filters.fournisseurId} onChange={(v) => setFilters({...filters, fournisseurId: v})} items={fournisseurs.map(f => ({id: f.id, label: f.nom}))} placeholder="Filtrer par Fournisseur" />
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <select value={filters.statut} onChange={(e) => setFilters({...filters, statut: e.target.value})} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500">
                        <option value="">Statut (Tous)</option>
                        <option value="actif">Actif</option>
                        <option value="ancien">Archivé / Ancien</option>
                      </select>
                    </div>
                    <div>
                      <select value={filters.avecSeuil} onChange={(e) => setFilters({...filters, avecSeuil: e.target.value})} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500">
                        <option value="">Seuil (Tous)</option>
                        <option value="oui">Avec Seuil d&aposalerte</option>
                        <option value="non">Sans Seuil</option>
                      </select>
                    </div>
                  </div>
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
                  <TableRow key={row.id} className={!row.original.isActive ? "bg-slate-50 opacity-70" : ""}>
                    {row.getAllCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun contrat ne correspond à ces critères.</TableCell></TableRow>
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

        {/* --- MODAL AJOUT / MODIF (CRUD) --- */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>{editingId ? 'Modifier le Contrat' : 'Ajouter un Contrat'}</DialogTitle></DialogHeader>
            <form id="contratForm" onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">N° Contrat *</label><Input id="numero" name="numero" required placeholder="CTR-..." /></div>
                <div><label className="block text-sm font-bold text-slate-900 mb-1">Montant Total (DA) *</label><Input type="number" step="0.01" id="montant" name="montant" required placeholder="0.00" className="border-emerald-500" /></div>
              </div>

              {/* 💡 حقل الاستهلاك الأولي */}
              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <label className="block text-sm font-medium text-blue-900 mb-1 flex items-center gap-1"><Info size={14}/> Consommation Initiale (DA)</label>
                <Input type="number" step="0.01" id="montantConsommeInitial" name="montantConsommeInitial" defaultValue="0" className="bg-white border-blue-200" />
                <p className="text-[10px] text-slate-500 mt-1">Saisissez ici le montant des factures déjà payées si le contrat a débuté avant l&aposutilisation du logiciel.</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Date de début *</label><Input type="date" id="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Date de fin</label><Input type="date" id="dateFin" name="dateFin" /></div>
              </div>

              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur *</label>
                  <FilterCombobox value={selectedFournisseur} onChange={setSelectedFournisseur} items={fournisseurs.map(f => ({id: f.id, label: f.nom}))} placeholder="Sélectionner..." />
                </div>
              )}
              
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Désignation (Optionnelle)</label><Input id="designation" name="designation" placeholder="Maintenance..." /></div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input type="checkbox" name="seuilActive" id="seuilActive" checked={hasSeuil} onChange={(e) => setHasSeuil(e.target.checked)} className="rounded border-slate-300 text-amber-600 focus:ring-amber-600" />
                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1"><AlertTriangle size={16} className="text-amber-500"/> Activer le Seuil d&aposalerte</span>
                </label>
                {hasSeuil && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Montant du Seuil (DA)</label>
                    <Input type="number" step="0.01" id="seuil" name="seuil" required={hasSeuil} placeholder="Ex: 80000.00" className="border-amber-300 bg-white" />
                  </div>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enregistrer</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* --- MODAL RENOUVELLEMENT --- */}
        <Dialog open={isRenewOpen} onOpenChange={setIsRenewOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle className="flex items-center gap-2 text-indigo-700"><RefreshCw size={20} /> Renouveler le Contrat</DialogTitle></DialogHeader>
            <div className="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-xs font-medium mb-2">l&aposancien contrat N° {renewOldNum} sera archivé. Veuillez saisir les informations du NOUVEAU contrat.</div>
            <form id="renewForm" onSubmit={handleRenewSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">NOUVEAU N° *</label><Input id="renewNumero" name="numero" required placeholder="Ex: CTR-2027-001" /></div>
                <div><label className="block text-sm font-bold text-slate-900 mb-1">Nouveau Montant *</label><Input type="number" step="0.01" id="renewMontant" name="montant" required className="border-indigo-300" /></div>
              </div>

              {/* 💡 حقل الاستهلاك الأولي في التجديد */}
              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <label className="block text-sm font-medium text-blue-900 mb-1 flex items-center gap-1"><Info size={14}/> Consommation Initiale (DA)</label>
                <Input type="number" step="0.01" id="renewMontantConsommeInitial" name="montantConsommeInitial" defaultValue="0" className="bg-white border-blue-200" />
                <p className="text-[10px] text-slate-500 mt-1">Généralement 0 pour un nouveau contrat.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Nouvelle Date Début *</label><Input type="date" id="renewDate" name="date" required defaultValue={new Date().toISOString().split('T')[0]} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Nouvelle Date Fin</label><Input type="date" id="renewDateFin" name="dateFin" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Nouvelle Désignation</label><Input id="renewDesignation" name="designation" placeholder="Renouvellement..." /></div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input type="checkbox" name="seuilActive" checked={hasSeuil} onChange={(e) => setHasSeuil(e.target.checked)} className="rounded border-slate-300 text-amber-600" />
                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1"><AlertTriangle size={16} className="text-amber-500"/> Définir un nouveau Seuil</span>
                </label>
                {hasSeuil && <Input type="number" step="0.01" id="renewSeuil" name="seuil" required={hasSeuil} className="bg-white" />}
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setIsRenewOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={loading} className="bg-indigo-600 text-white hover:bg-indigo-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmer Renouvellement</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* --- MODAL IMPORTATION --- */}
        <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if(!open) { setImportFile(null); setPreviewData(null); } }}>
          <DialogContent className="sm:max-w-[650px]">
            <DialogHeader><DialogTitle>Importer des Contrats (Smart Import)</DialogTitle></DialogHeader>
            {!previewData ? (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Structure Excel :</p>
                    <ul className="list-disc ml-4 space-y-1 text-xs">
                      <li>Colonnes: N° Contrat | Fournisseur | Date Début | Date Fin | Montant | Désignation | Seuil (Oui/Non) | Montant Seuil</li>
                      <li>Le Fournisseur <strong className="font-bold">doit exister</strong>.</li>
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
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4"><p className="text-sm text-emerald-800 font-medium">{previewData.validRows.length} contrat(s) valide(s).</p></div>
                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setIsImportOpen(false)}>Annuler</Button>
                  <Button onClick={handleConfirmImport} disabled={previewData.validRows.length === 0 || importing} className="bg-emerald-600 hover:bg-emerald-700 text-white">{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Importer</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* --- SHEET FICHE DÉTAILLÉE 360° --- */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-slate-50 p-0 shadow-2xl border-l border-slate-200">
            {loadingDetails || !details ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
            ) : (
              <div className="flex flex-col h-full">
                <div className={`${details.isActive ? 'bg-slate-900' : 'bg-slate-700'} text-white p-6 shrink-0`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold flex items-center gap-2"><FileSignature size={24}/> Contrat N° {details.numero}</h2>
                      <p className="text-slate-300 text-sm mt-1">{details.fournisseur.nom}</p>
                      {!details.isActive && <span className="inline-block mt-2 px-2 py-1 bg-red-500/20 text-red-200 text-xs font-bold rounded">CONTRAT ANCIEN / ARCHIVÉ</span>}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold tabular-nums text-emerald-400">{formatMontant(details.montant)}</p>
                      <p className="text-xs text-slate-400 mt-1">Du {formatDate(details.date)} {details.dateFin && `au ${formatDate(details.dateFin)}`}</p>
                    </div>
                  </div>

                  {details.parent && <div className="bg-indigo-500/20 text-indigo-200 p-2 rounded text-xs mb-4"><strong>Origine :</strong> Renouvellement du contrat N° {details.parent.numero}</div>}
                  
                  <div className="mb-4">
                    <div className="flex justify-between text-xs font-medium mb-1"><span>Avancement Paiement ({details.pourcentagePaiement.toFixed(2)}%)</span><span>Total Payé: {formatMontant(details.totalPaye)}</span></div>
                    <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${details.pourcentagePaiement}%` }}></div></div>
                  </div>

                  {/* 💡 إظهار الاستهلاك الأولي في الفيش ديطاي */}
                  {details.montantConsommeInitial > 0 && (
                    <div className="bg-blue-500/20 border border-blue-500/30 text-blue-100 p-3 rounded-lg text-xs mb-4 flex gap-2">
                      <Info size={16} className="shrink-0 mt-0.5 text-blue-300" />
                      <div>
                        <strong>Consommation Initiale :</strong> {formatMontant(details.montantConsommeInitial)}<br/>
                        <span className="opacity-80">Ce montant correspond aux factures antérieures au logiciel, il est inclus dans le calcul du seuil.</span>
                      </div>
                    </div>
                  )}

                  {details.seuilActive && (
                    <div className={`p-3 rounded-lg border ${details.pourcentageSeuil >= 90 ? 'bg-red-500/20 border-red-500/50' : 'bg-amber-500/20 border-amber-500/50'}`}>
                      <div className="flex justify-between text-xs font-medium mb-1 text-white"><span className="flex items-center gap-1"><AlertTriangle size={14}/> Seuil d&aposalerte ({formatMontant(details.seuil)})</span><span>Consommé: {details.pourcentageSeuil.toFixed(1)}%</span></div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2"><div className={`h-1.5 rounded-full ${details.pourcentageSeuil >= 90 ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(details.pourcentageSeuil, 100)}%` }}></div></div>
                      {details.pourcentageSeuil >= 90 && <p className="text-[10px] text-red-200 mt-2 font-bold">ATTENTION : Le seuil de ce contrat est presque ou totalement atteint !</p>}
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Receipt size={20} className="text-slate-500"/> Factures associées ({details.factures.length})</h3>
                  {details.factures.length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">Aucune facture rattachée à ce contrat.</div>
                  ) : (
                    <div className="space-y-4">
                      {details.factures.map((facture: any) => (
                        <div key={facture.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                            <div><p className="font-bold text-slate-900">{facture.numero}</p><p className="text-xs text-slate-500">{facture.designation || 'Sans désignation'}</p></div>
                            <div className="text-right"><p className="font-bold tabular-nums text-slate-900">{formatMontant(facture.montant)}</p><span className="text-[10px] font-bold text-slate-500">Payé à {facture.pourcentage}%</span></div>
                          </div>
                          {facture.cheques.length > 0 ? (
                            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                              <p className="text-xs font-bold text-slate-600 mb-2 uppercase">Chèques de règlement :</p>
                              {facture.cheques.map((cheque: any) => (
                                <div key={cheque.id} className="flex justify-between items-center text-sm border-l-2 border-emerald-500 pl-3">
                                  <div className="flex flex-col"><span className="font-medium text-slate-800">N° {cheque.numeroCheque}</span><span className="text-[10px] text-slate-500 flex items-center gap-1">{cheque.statut === 'ANNULE' ? <CircleDashed size={10} className="text-red-500"/> : <CheckCircle2 size={10} className="text-emerald-500"/>}{cheque.statut}</span></div>
                                  <span className={`font-bold tabular-nums ${cheque.statut === 'ANNULE' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{formatMontant(Number(cheque.montant))}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic">Aucun règlement.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}