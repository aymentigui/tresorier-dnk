'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createFacture, updateFacture, deleteFacture, getFactureDetails, getDocsForFournisseur } from './actions';
import { previewFactureImport, confirmFactureImport } from './import-actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { 
  Plus, Search, Edit2, Trash2, Loader2, Eye, Receipt, FileText, FileSignature, 
  CheckCircle2, CircleDashed, FilterX, Download, Upload, AlertCircle, FileSpreadsheet, 
  Filter, ChevronsUpDown, Check, AlertTriangle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

// --- COMPOSANT COMBOBOX POUR LA RECHERCHE (Filtres Pro) ---
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

type Facture = {
  id: string; numero: string; designation?: string; displayDesignation: string; 
  description?: string; date: Date; montant: number;
  statut: string; pourcentage: number;
  fournisseurId: string; fournisseur: { nom: string };
  bonCommande?: { id: string, numero: string };
  contrat?: { id: string, numero: string };
};

export default function FacturesClient({
  initialData, summary, totalPages, currentPage, currentFilters, fournisseurs, bonsCommandes, contrats
}: {
  initialData: Facture[]; summary: any; total: number; totalPages: number; currentPage: number; currentFilters: any;
  fournisseurs: { id: string; nom: string }[]; bonsCommandes: { id: string; numero: string }[]; contrats: { id: string; numero: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States CRUD Formulaire
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFournisseur, setSelectedFournisseur] = useState('');
  const [rattachement, setRattachement] = useState('AUCUN');
  const [availableBcs, setAvailableBcs] = useState<{id: string, numero: string}[]>([]);
  const [availableContrats, setAvailableContrats] = useState<{id: string, numero: string}[]>([]);

  // States Fiche Détaillée
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // States Filtres Avancés
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: currentFilters.search,
    fournisseurId: currentFilters.fournisseurId,
    statut: currentFilters.statut,
    rattachement: currentFilters.rattachement,
    bonCommandeId: currentFilters.bonCommandeId,
    contratId: currentFilters.contratId,
    dateDebut: currentFilters.dateDebut,
    dateFin: currentFilters.dateFin,
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

  // --- ACTIONS FILTRES & EXPORT ---
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
    window.location.href = `/api/export/factures?${params.toString()}`;
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
    
    const result = await previewFactureImport(formData);
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
    const result = await confirmFactureImport(previewData.validRows);
    
    if (result.dbErrors?.length) toast.warning(`${result.successCount} ajoutées, ${result.dbErrors.length} erreurs`);
    else toast.success(`${result.successCount} factures importées avec succès !`);
    
    setIsImportOpen(false); setImportFile(null); setPreviewData(null); setImporting(false);
  };

  // --- LOGIQUE FORMULAIRE DYNAMIQUE ---
  useEffect(() => {
    if (selectedFournisseur) {
      getDocsForFournisseur(selectedFournisseur).then(res => {
        setAvailableBcs(res.bonsCommandes);
        setAvailableContrats(res.contrats);
      });
    } else {
      setAvailableBcs([]); setAvailableContrats([]); setRattachement('AUCUN');
    }
  }, [selectedFournisseur]);

  const openNew = () => {
    setEditingId(null); setSelectedFournisseur(''); setRattachement('AUCUN'); setIsDialogOpen(true);
    setTimeout(() => (document.getElementById('factureForm') as HTMLFormElement)?.reset(), 50);
  };

  const openEdit = (f: Facture) => {
    setEditingId(f.id);
    setSelectedFournisseur(f.fournisseurId);
    if (f.bonCommande) setRattachement('BC');
    else if (f.contrat) setRattachement('CONTRAT');
    else setRattachement('AUCUN');

    setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('numero') as HTMLInputElement).value = f.numero;
      (document.getElementById('designation') as HTMLInputElement).value = f.designation || '';
      (document.getElementById('description') as HTMLInputElement).value = f.description || '';
      (document.getElementById('date') as HTMLInputElement).value = new Date(f.date).toISOString().split('T')[0];
      (document.getElementById('montant') as HTMLInputElement).value = String(f.montant);
      
      setTimeout(() => {
        if (f.bonCommande) (document.getElementById('bonCommandeId') as HTMLSelectElement).value = f.bonCommande.id;
        if (f.contrat) (document.getElementById('contratId') as HTMLSelectElement).value = f.contrat.id;
      }, 300);
    }, 50);
  };

  const openDetails = async (id: string) => {
    setIsSheetOpen(true);
    setLoadingDetails(true);
    const data = await getFactureDetails(id);
    if (data) setDetails(data); else toast.error("Erreur de chargement");
    setLoadingDetails(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(!selectedFournisseur) return toast.error("Veuillez sélectionner un fournisseur");
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append('fournisseurId', selectedFournisseur);
    formData.append('rattachement', rattachement);

    const res = editingId ? await updateFacture(editingId, formData) : await createFacture(formData);
    if (res.error) toast.error(res.error); else { toast.success("Enregistré"); setIsDialogOpen(false); setEditingId(null); }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette facture ? Les liaisons avec les chèques seront annulées.")) return;
    const res = await deleteFacture(id);
    if (res.error) toast.error(res.error); else toast.success("Facture supprimée");
  };

  // --- COLONNES ---
  const columns: ColumnDef<typeof features, Facture>[] = [
    { 
      accessorKey: 'numero', header: 'N° Facture', 
      cell: (info) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900">{info.getValue() as string}</span>
          <span className="text-[10px] text-slate-500 truncate max-w-[150px]" title={info.row.original.displayDesignation}>{info.row.original.displayDesignation}</span>
        </div>
      )
    },
    { accessorKey: 'date', header: 'Date', cell: (info) => <span className="text-slate-600 text-sm">{formatDate(info.getValue() as Date)}</span> },
    { id: 'fournisseur', header: 'Fournisseur', cell: (info) => <span className="font-medium text-slate-700">{info.row.original.fournisseur.nom}</span> },
    { accessorKey: 'montant', header: 'Montant (DA)', cell: (info) => <span className="font-bold tabular-nums text-slate-900">{formatMontant(info.getValue() as number)}</span> },
    {
      id: 'statut', header: 'Statut / Paiement',
      cell: (info) => {
        const f = info.row.original;
        const color = f.statut === 'PAYEE' ? 'emerald' : f.statut === 'PARTIELLEMENT_PAYEE' ? 'amber' : 'red';
        return (
          <div className="flex flex-col gap-1 w-24">
            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold w-fit bg-${color}-100 text-${color}-800`}>{f.statut.replace('_', ' ')}</span>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div className={`bg-${color}-500 h-1.5 rounded-full`} style={{ width: `${f.pourcentage}%` }}></div>
            </div>
          </div>
        );
      }
    },
    {
      id: 'actions', header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const f = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openDetails(f.id)} className="text-slate-500 hover:text-blue-600 bg-blue-50/50"><Eye size={16} /></Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(f)} className="text-slate-500 hover:text-emerald-600"><Edit2 size={16} /></Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)} className="text-slate-500 hover:text-red-600"><Trash2 size={16} /></Button>
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
          <div><p className="text-slate-400 text-sm font-medium">Total de la sélection (Filtres)</p><p className="text-2xl font-bold tabular-nums mt-1">{formatMontant(summary?.totalMontant || 0)}</p></div>
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm">{summary?.totalCount || 0} facture(s) trouvée(s)</div>
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
              <Plus size={18} className="mr-2" /> Nouvelle Facture
            </Button>
          </div>
        </div>

        {/* 3. PANNEAU DES FILTRES AVANCÉS */}
        {showFilters && (
          <div className="p-5 bg-indigo-50/30 border-b border-slate-200 animate-in slide-in-from-top-2">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Entités & Origine */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Entités & Rattachement</h4>
                  <FilterCombobox value={filters.fournisseurId} onChange={(v) => setFilters({...filters, fournisseurId: v})} items={fournisseurs.map(f => ({id: f.id, label: f.nom}))} placeholder="Filtrer par Fournisseur" />
                  
                  <div className="grid grid-cols-2 gap-2">
                    <FilterCombobox value={filters.contratId} onChange={(v) => setFilters({...filters, contratId: v})} items={contrats.map(c => ({id: c.id, label: `Contrat N° ${c.numero}`}))} placeholder="Par Contrat" />
                    <FilterCombobox value={filters.bonCommandeId} onChange={(v) => setFilters({...filters, bonCommandeId: v})} items={bonsCommandes.map(bc => ({id: bc.id, label: `BC N° ${bc.numero}`}))} placeholder="Par BC" />
                  </div>
                  
                  <div>
                    <select value={filters.rattachement} onChange={(e) => setFilters({...filters, rattachement: e.target.value})} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500">
                      <option value="">Type d'origine (Tous)</option>
                      <option value="AUCUN">Indépendante (Sans BC ni Contrat)</option>
                      <option value="BC">Liée à un BC</option>
                      <option value="CONTRAT">Liée à un Contrat</option>
                    </select>
                  </div>
                </div>

                {/* Critères Financiers */}
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
                    <label className="text-xs text-slate-500 mb-1 block">Statut de paiement</label>
                    <select value={filters.statut} onChange={(e) => setFilters({...filters, statut: e.target.value})} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500">
                      <option value="">Tous les statuts</option>
                      <option value="EN_ATTENTE">En attente (Impayée)</option>
                      <option value="PARTIELLEMENT_PAYEE">Partiellement payée</option>
                      <option value="PAYEE">Payée (Soldée)</option>
                    </select>
                  </div>
                </div>

                {/* Périodes */}
                <div className="space-y-3 flex flex-col h-full">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Périodes d&aposémission</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Du</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateDebut} onChange={(e) => setFilters({...filters, dateDebut: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Au</label>
                      <Input type="date" className="h-9 bg-white" value={filters.dateFin} onChange={(e) => setFilters({...filters, dateFin: e.target.value})} />
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
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucune facture ne correspond à ces critères.</TableCell></TableRow>
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
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? 'Modifier la Facture' : 'Ajouter une Facture'}</DialogTitle></DialogHeader>
            <form id="factureForm" onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">N° Facture *</label><Input id="numero" name="numero" required placeholder="FACT-..." /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Date *</label><Input type="date" id="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} /></div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur *</label>
                <select id="fournisseurId" name="fournisseurId" required value={selectedFournisseur} onChange={(e) => setSelectedFournisseur(e.target.value)} className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900">
                  <option value="">Sélectionner...</option>
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <label className="block text-sm font-bold text-slate-900">Rattachement (Optionnel)</label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="radio" name="rattach" checked={rattachement === 'AUCUN'} onChange={() => setRattachement('AUCUN')} className="text-emerald-600 focus:ring-emerald-600"/> Aucun</label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="radio" name="rattach" checked={rattachement === 'BC'} onChange={() => setRattachement('BC')} disabled={!selectedFournisseur || availableBcs.length === 0} className="text-emerald-600 focus:ring-emerald-600"/> Bon de Commande</label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="radio" name="rattach" checked={rattachement === 'CONTRAT'} onChange={() => setRattachement('CONTRAT')} disabled={!selectedFournisseur || availableContrats.length === 0} className="text-emerald-600 focus:ring-emerald-600"/> Contrat</label>
                </div>
                {rattachement === 'BC' && (
                  <select id="bonCommandeId" name="bonCommandeId" required className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Sélectionner un BC...</option>
                    {availableBcs.map(bc => <option key={bc.id} value={bc.id}>{bc.numero}</option>)}
                  </select>
                )}
                {rattachement === 'CONTRAT' && (
                  <select id="contratId" name="contratId" required className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Sélectionner un Contrat...</option>
                    {availableContrats.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
                  </select>
                )}
              </div>

              <div><label className="block text-sm font-bold text-slate-900 mb-1">Montant TTC (DA) *</label><Input type="number" step="0.01" id="montant" name="montant" required placeholder="0.00" className="border-emerald-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Désignation</label><Input id="designation" name="designation" placeholder="Héritée si vide" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Description</label><Input id="description" name="description" placeholder="Notes..." /></div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enregistrer</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* --- MODAL IMPORTATION --- */}
        <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if(!open) { setImportFile(null); setPreviewData(null); } }}>
          <DialogContent className="sm:max-w-[650px]">
            <DialogHeader><DialogTitle>Importer des Factures (Smart Import)</DialogTitle></DialogHeader>
            {!previewData ? (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Structure Excel :</p>
                    <ul className="list-disc ml-4 space-y-1 text-xs">
                      <li>Colonnes: N° Facture | Fournisseur | Date | Montant | Désignation | Desc | Type (BC/CONTRAT) | N° Rattachement</li>
                      <li>Le Fournisseur <strong className="font-bold">doit exister</strong>.</li>
                      <li>Si BC/Contrat précisé, le système validera son appartenance au fournisseur.</li>
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
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4"><p className="text-sm text-emerald-800 font-medium">{previewData.validRows.length} facture(s) valide(s).</p></div>
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
          <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-slate-50 p-0 border-l border-slate-200 shadow-2xl">
            {loadingDetails || !details ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="bg-slate-900 text-white p-6 shrink-0 relative overflow-hidden">
                  <Receipt size={100} className="absolute -bottom-6 -right-6 text-slate-800 opacity-50" />
                  <h2 className="text-2xl font-bold relative z-10">Facture N° {details.numero}</h2>
                  <p className="text-slate-300 text-sm mt-1 mb-4 relative z-10">{details.fournisseur.nom}</p>
                  <p className="text-3xl font-bold tabular-nums text-emerald-400 relative z-10">{formatMontant(details.montant)}</p>
                  <p className="text-xs text-slate-400 mt-1 relative z-10">Datée du {formatDate(details.date)}</p>
                </div>

                <div className="p-6 pb-2">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
                    {details.bonCommande ? (
                      <><div className="bg-blue-100 p-3 rounded-full text-blue-600"><FileText size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase">Liée au Bon de commande</p><p className="text-sm font-bold text-slate-900">{details.bonCommande.numero}</p></div></>
                    ) : details.contrat ? (
                      <><div className="bg-indigo-100 p-3 rounded-full text-indigo-600"><FileSignature size={24}/></div><div><p className="text-xs text-slate-500 font-bold uppercase">Liée au Contrat</p><p className="text-sm font-bold text-slate-900">{details.contrat.numero}</p></div></>
                    ) : (
                      <><div className="bg-slate-100 p-3 rounded-full text-slate-500"><Receipt size={24}/></div><div><p className="text-sm font-bold text-slate-500">Facture Indépendante</p><p className="text-xs text-slate-400">Aucun contrat ou BC associé.</p></div></>
                    )}
                  </div>
                </div>

                <div className="px-6 py-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Statut de paiement</h3>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex justify-between items-end mb-2">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${details.statut === 'PAYEE' ? 'bg-emerald-100 text-emerald-800' : details.statut === 'PARTIELLEMENT_PAYEE' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{details.statut.replace('_', ' ')}</span>
                      <span className="font-bold text-slate-900">{details.pourcentage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2"><div className={`h-2 rounded-full ${details.statut === 'PAYEE' ? 'bg-emerald-500' : details.statut === 'PARTIELLEMENT_PAYEE' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${details.pourcentage}%` }}></div></div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-medium"><span>Payé: {formatMontant((details.montant * details.pourcentage) / 100)}</span><span>Reste: {formatMontant(details.montant - ((details.montant * details.pourcentage) / 100))}</span></div>
                  </div>
                </div>

                <div className="px-6 py-4 flex-1">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Règlements (Chèques)</h3>
                  {details.cheques.length === 0 ? (
                    <p className="text-sm text-slate-500 italic text-center p-4 bg-white border border-dashed border-slate-300 rounded-xl">Aucun chèque n'a encore été émis.</p>
                  ) : (
                    <div className="space-y-3">
                      {details.cheques.map((c: any) => (
                        <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col gap-2">
                          <div className="flex justify-between items-start"><span className="font-bold text-slate-900 text-sm">{c.numeroCheque}</span><span className={`font-bold tabular-nums text-sm ${c.statut === 'ANNULE' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{formatMontant(c.montant)}</span></div>
                          <div className="flex justify-between items-center text-[10px] text-slate-500"><span className="flex items-center gap-1">{c.statut === 'ANNULE' ? <CircleDashed size={12} className="text-red-500"/> : <CheckCircle2 size={12} className="text-emerald-500"/>}{c.statut}</span><span>Émis le {formatDate(c.dateCreation)}</span></div>
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