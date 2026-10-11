'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createFournisseur, updateFournisseur, deleteFournisseur, manageFournisseurSeuil } from './actions';
import { previewFournisseurImport, confirmFournisseurImport } from './import-actions';
import { toast } from 'sonner';
import { flexRender, tableFeatures, useTable, ColumnDef } from '@tanstack/react-table';
import { 
  Plus, Search, Edit2, Trash2, Loader2, AlertTriangle, Building2, 
  RefreshCw, FilterX, Download, Upload, AlertCircle, FileSpreadsheet, Filter 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

type Fournisseur = { id: string; nom: string; activite?: string; cumulMontant: number; seuil: number; seuilActive: boolean; };

export type FournisseurFilters = { search?: string; activite?: string; alerteSeuil?: string; };
export type FournisseurSummary = { totalCount?: number; [key: string]: unknown; };

export default function FournisseursClient({
  initialData, totalPages, currentPage, currentFilters, summary
}: {
  initialData: Fournisseur[]; total: number; totalPages: number; currentPage: number; currentFilters?: FournisseurFilters; summary?: FournisseurSummary;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  
  // States Modal CRUD
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hasSeuil, setHasSeuil] = useState(false);

  // States Modal Renouvellement (Seuil & Cumul)
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [renewingFournisseur, setRenewingFournisseur] = useState<Fournisseur | null>(null);
  const [renewHasSeuil, setRenewHasSeuil] = useState(false);

  // States Filtres Avancés
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: currentFilters?.search || '',
    activite: currentFilters?.activite || '',
    alerteSeuil: currentFilters?.alerteSeuil || '',
  });

type ImportError = { line: number; message: string };

type ImportPreviewData = {
  validRows: Array<{ nom: string; activite: string | null; seuilActive: boolean; seuil: number }>;
  errors: ImportError[];
  total: number;
  error?: string;
};

// States Import
const [isImportOpen, setIsImportOpen] = useState(false);
const [importFile, setImportFile] = useState<File | null>(null);
const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
const [importing, setImporting] = useState(false);

  const formatMontant = (m: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(m);

  // --- ACTIONS FILTRES ET EXPORT ---
  const applyFilters = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value as string); });
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const resetFilters = () => {
    setFilters({ search: '', activite: '', alerteSeuil: '' });
    router.push('?page=1');
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value as string); });
    window.location.href = `/api/export/fournisseurs?${params.toString()}`;
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
    
    const result = await previewFournisseurImport(formData);
    if ('error' in result && result.error) { toast.error(result.error); setImportFile(null); } 
    else { setPreviewData(result as ImportPreviewData); }
    setLoading(false);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    if (!previewData?.validRows.length) return;
    setImporting(true);
    const result = await confirmFournisseurImport(previewData.validRows);
    
    if (result.dbErrors?.length) toast.warning(`${result.successCount} ajoutés, ${result.dbErrors.length} erreurs`);
    else toast.success(`${result.successCount} Fournisseurs importés avec succès !`);
    
    setIsImportOpen(false); setImportFile(null); setPreviewData(null); setImporting(false);
  };

  // --- ACTIONS CRUD & RENEW ---
  const openNew = () => {
    setEditingId(null); setHasSeuil(false); setIsDialogOpen(true);
    setTimeout(() => (document.getElementById('fournisseurForm') as HTMLFormElement)?.reset(), 50);
  };

  const openEdit = (f: Fournisseur) => {
    setEditingId(f.id); setHasSeuil(f.seuilActive); setIsDialogOpen(true);
    setTimeout(() => {
      (document.getElementById('nom') as HTMLInputElement).value = f.nom;
      (document.getElementById('activite') as HTMLInputElement).value = f.activite || '';
      (document.getElementById('seuil') as HTMLInputElement).value = String(f.seuil || '');
    }, 50);
  };

  const openRenew = (f: Fournisseur) => {
    setRenewingFournisseur(f);
    setRenewHasSeuil(f.seuilActive);
    setIsRenewOpen(true);
    setTimeout(() => {
      (document.getElementById('cumulMontant') as HTMLInputElement).value = String(f.cumulMontant || 0);
      if (f.seuilActive) (document.getElementById('renewSeuil') as HTMLInputElement).value = String(f.seuil || 0);
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = editingId ? await updateFournisseur(editingId, formData) : await createFournisseur(formData);

    if (res.error) toast.error(res.error);
    else {
      toast.success(editingId ? "Fournisseur modifié" : "Fournisseur ajouté");
      setIsDialogOpen(false); setEditingId(null);
    }
    setLoading(false);
  };

  const handleRenewSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!renewingFournisseur) return;
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const res = await manageFournisseurSeuil(renewingFournisseur.id, formData);

    if (res.error) toast.error(res.error);
    else {
      toast.success("Montants du fournisseur mis à jour avec succès");
      setIsRenewOpen(false);
      setRenewingFournisseur(null);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce fournisseur ? Ses factures, chèques et contrats risquent d'être supprimés.")) return;
    const res = await deleteFournisseur(id);
    if (res.error) toast.error(res.error);
    else toast.success("Fournisseur supprimé");
  };

  const columns: ColumnDef<typeof features, Fournisseur>[] = [
    { accessorKey: 'nom', header: 'Nom', cell: (info) => <span className="font-bold text-slate-900">{info.getValue() as string}</span> },
    { accessorKey: 'activite', header: 'Activité', cell: (info) => <span className="text-slate-600">{info.getValue() as string || '-'}</span> },
    { accessorKey: 'cumulMontant', header: 'Cumul Payé (Chèques)', cell: (info) => <span className="font-bold tabular-nums text-indigo-600">{formatMontant(info.getValue() as number)}</span> },
    { 
      id: 'seuil', header: 'Seuil & Alerte', 
      cell: (info) => {
        const f = info.row.original;
        if (!f.seuilActive) return <span className="text-xs text-slate-400 italic">Désactivé</span>;
        const pct = f.seuil > 0 ? (f.cumulMontant / f.seuil) * 100 : 0;
        const isAlert = pct >= 90;
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 text-sm">{formatMontant(f.seuil)}</span>
            {isAlert && <span title={`Alerte : ${pct.toFixed(1)}% atteint !`}><AlertTriangle size={14} className="text-red-500" /></span>}
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
            <Link href={`/fournisseurs/${f.id}`}>
              <Button variant="ghost" size="icon" className="text-white bg-indigo-600 hover:bg-indigo-700 hover:text-white" title="Profil 360°">
                <Building2 size={16} />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => openRenew(f)} className="text-slate-500 hover:text-amber-600 bg-amber-50/50" title="Gérer/Réinitialiser le Seuil et Cumul"><RefreshCw size={16} /></Button>
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
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex items-center justify-between">
            <div><p className="text-slate-400 text-sm font-medium">Total Fournisseurs</p><p className="text-2xl font-bold tabular-nums mt-1">{summary.totalCount}</p></div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* 2. BARRE OUTILS & RECHERCHE */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <form onSubmit={(e) => { e.preventDefault(); applyFilters(); }} className="relative w-full md:w-96 flex gap-2">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <Input value={filters.search} onChange={(e) => setFilters({...filters, search: e.target.value})} placeholder="Recherche rapide (Nom)..." className="pl-10 h-10 bg-white" />
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
              <Plus size={18} className="mr-2" /> Nouveau Fournisseur
            </Button>
          </div>
        </div>

        {/* 3. PANNEAU DES FILTRES AVANCÉS */}
        {showFilters && (
          <div className="p-5 bg-indigo-50/30 border-b border-slate-200 animate-in slide-in-from-top-2">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Activité</h4>
                  <Input type="text" placeholder="Rechercher par activité..." className="h-9 bg-white" value={filters.activite} onChange={(e) => setFilters({...filters, activite: e.target.value})} />
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Alertes Seuils</h4>
                  <select value={filters.alerteSeuil} onChange={(e) => setFilters({...filters, alerteSeuil: e.target.value})} className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Tous les fournisseurs</option>
                    <option value="critique">En Alerte Critique (≥ 90%)</option>
                    <option value="normal">Statut Normal</option>
                  </select>
                </div>

                <div className="flex items-end gap-2 h-full pt-2">
                   <Button onClick={applyFilters} className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 flex-1">Appliquer l&aposanalyse</Button>
                   <Button onClick={resetFilters} variant="outline" size="icon" title="Réinitialiser" className="h-9 w-10 shrink-0 bg-white"><FilterX size={16} /></Button>
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
                table.getRowModel().rows.map((row) => {
                  const isAlert = row.original.seuilActive && (row.original.cumulMontant / row.original.seuil) >= 0.9;
                  return (
                    <TableRow key={row.id} className={isAlert ? "bg-red-50/40" : ""}>
                      {row.getAllCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">Aucun fournisseur trouvé.</TableCell></TableRow>
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

        {/* --- MODAL CRUD --- */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>{editingId ? 'Modifier le Fournisseur' : 'Ajouter un Fournisseur'}</DialogTitle></DialogHeader>
            <form id="fournisseurForm" onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom / Raison Sociale *</label>
                <Input id="nom" name="nom" required placeholder="Ex: Sarl XYZ" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Activité (Optionnel)</label>
                <Input id="activite" name="activite" placeholder="Fourniture de matériel informatique..." />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input type="checkbox" name="seuilActive" id="seuilActive" checked={hasSeuil} onChange={(e) => setHasSeuil(e.target.checked)} className="rounded border-slate-300 text-amber-600 focus:ring-amber-600" />
                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1"><AlertTriangle size={16} className="text-amber-500"/> Activer le Seuil Global</span>
                </label>
                {hasSeuil && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Montant du Seuil (DA)</label>
                    <Input type="number" step="0.01" id="seuil" name="seuil" required={hasSeuil} placeholder="Ex: 5000000.00" className="border-amber-300 bg-white" />
                    <p className="text-[10px] text-slate-400 mt-1">Alerte déclenchée à 90% du cumul des chèques émis.</p>
                  </div>
                )}
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

        {/* --- MODAL RENOUVELLEMENT SEUIL & CUMUL --- */}
        <Dialog open={isRenewOpen} onOpenChange={setIsRenewOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <RefreshCw size={20} /> Gérer le Cumul et le Seuil
              </DialogTitle>
            </DialogHeader>
            <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-xs font-medium mt-2">
              L&apos;historique des anciennes valeurs sera conservé dans le journal d&apos;audit. Vous pouvez réinitialiser le cumul (ex: début d&apos;année) ou ajuster le seuil d&apos;alerte.
            </div>
            
            {renewingFournisseur && (
              <form onSubmit={handleRenewSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-bold text-slate-900 mb-1">Cumul Payé (Chèques) (DA) *</label>
                  <Input type="number" step="0.01" id="cumulMontant" name="cumulMontant" required placeholder="0.00" className="border-slate-300" />
                  <p className="text-[10px] text-slate-500 mt-1">Mettez &quot;0&quot; pour réinitialiser le compteur pour une nouvelle période.</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input type="checkbox" name="seuilActive" checked={renewHasSeuil} onChange={(e) => setRenewHasSeuil(e.target.checked)} className="rounded border-slate-300 text-amber-600 focus:ring-amber-600" />
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-1"><AlertTriangle size={16} className="text-amber-500"/> Activer / Modifier le Seuil</span>
                  </label>
                  {renewHasSeuil && (
                    <Input type="number" step="0.01" id="renewSeuil" name="seuil" required={renewHasSeuil} placeholder="Nouveau Seuil..." className="bg-white border-amber-300" />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Motif de la modification (Optionnel)</label>
                  <Input name="motif" placeholder="Ex: Début de la nouvelle année comptable 2026..." />
                </div>

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsRenewOpen(false)}>Annuler</Button>
                  <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmer la modification
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* --- MODAL IMPORTATION --- */}
        <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if(!open) { setImportFile(null); setPreviewData(null); } }}>
          <DialogContent className="sm:max-w-[650px]">
            <DialogHeader><DialogTitle>Importer des Fournisseurs</DialogTitle></DialogHeader>
            {!previewData ? (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Structure Excel :</p>
                    <ul className="list-disc ml-4 space-y-1 text-xs">
                      <li>Colonnes: Nom | Activité | Seuil Activé (Oui/Non) | Montant Seuil</li>
                      <li>Le Nom du fournisseur doit être <strong>unique</strong>.</li>
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
                    <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto list-disc pl-4">{previewData.errors.map((e: ImportError, i: number) => <li key={i}>Ligne {e.line}: {e.message}</li>)}</ul>
                  </div>
                )}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4"><p className="text-sm text-emerald-800 font-medium">{previewData.validRows.length} fournisseur(s) valide(s).</p></div>
                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setIsImportOpen(false)}>Annuler</Button>
                  <Button onClick={handleConfirmImport} disabled={previewData.validRows.length === 0 || importing} className="bg-emerald-600 hover:bg-emerald-700 text-white">{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Importer</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}