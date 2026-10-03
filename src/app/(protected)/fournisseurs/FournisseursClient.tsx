'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createFournisseur, updateFournisseur, deleteFournisseur } from './actions';
import { previewExcelImport, confirmImport } from './import-actions'; // إضافة دوال الاستيراد
import { toast } from 'sonner';
import { 
  flexRender, 
  tableFeatures,
  useTable, 
  ColumnDef 
} from '@tanstack/react-table';
import { Plus, Search, Edit2, Trash2, Loader2, Download, Upload, AlertCircle, FileSpreadsheet } from 'lucide-react'; // أيقونات جديدة
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = tableFeatures({});

// تعريف نوع البيانات
type Fournisseur = {
  id: string;
  nom: string;
  activite: string | null;
  createdAt: Date;
};

export default function FournisseursClient({
  initialData,
  total,
  totalPages,
  currentPage,
  currentSearch,
}: {
  initialData: Fournisseur[];
  total: number;
  totalPages: number;
  currentPage: number;
  currentSearch: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Ref لزر رفع الملف
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States تاع CRUD والبحث
  const [search, setSearch] = useState(currentSearch);
  const [prevSearch, setPrevSearch] = useState(currentSearch);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // States تاع الاستيراد (Import)
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  if (prevSearch !== currentSearch) {
    setPrevSearch(currentSearch);
    setSearch(currentSearch);
  }

  // تحديث الرابط عند البحث
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search) params.set('search', search);
    else params.delete('search');
    params.set('page', '1'); // نرجعو للصفحة الأولى
    router.push(`?${params.toString()}`);
  };

  // فتح نافذة التعديل
  const openEdit = (fournisseur: Fournisseur) => {
    setEditingId(fournisseur.id);
    setIsDialogOpen(true);
    setTimeout(() => {
      const nomInput = document.getElementById('nom') as HTMLInputElement | null;
      const activiteInput = document.getElementById('activite') as HTMLInputElement | null;
      if (nomInput) nomInput.value = fournisseur.nom;
      if (activiteInput) activiteInput.value = fournisseur.activite || '';
    }, 50);
  };

  // إرسال الفورميلار (إضافة أو تعديل)
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const res = editingId 
      ? await updateFournisseur(editingId, formData)
      : await createFournisseur(formData);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(editingId ? "Fournisseur modifié" : "Fournisseur ajouté");
      setIsDialogOpen(false);
      setEditingId(null);
    }
    setLoading(false);
  };

  // الحذف
  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce fournisseur ?")) return;
    const res = await deleteFournisseur(id);
    if (res.error) toast.error(res.error);
    else toast.success("Fournisseur supprimé");
  };

  // ---------------------------------------------------------
  // دوال الاستيراد والتصدير (Import / Export)
  // ---------------------------------------------------------
  
  const handleExport = () => {
    const url = `/api/export/fournisseurs${currentSearch ? `?search=${currentSearch}` : ''}`;
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
      toast.warning(`${result.successCount} ajoutés, ${result.dbErrors.length} ignorés (doublons)`);
    } else {
      toast.success(`${result.successCount} fournisseurs importés avec succès !`);
    }
    
    setIsImportOpen(false);
    setImportFile(null);
    setPreviewData(null);
    setImporting(false);
  };

  // إعدادات أعمدة الجدول
  const columns: ColumnDef<typeof features, Fournisseur>[] = [
    {
      accessorKey: 'nom',
      header: 'Nom du Fournisseur',
      cell: (info) => <span className="font-medium text-slate-900">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'activite',
      header: 'Activité',
      cell: (info) => <span className="text-slate-500">{(info.getValue() as string) || '-'}</span>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: (info) => {
        const fournisseur = info.row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(fournisseur)} className="text-slate-500 hover:text-emerald-600">
              <Edit2 size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(fournisseur.id)} className="text-slate-500 hover:text-red-600">
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
      
      {/* شريط البحث والأزرار */}
      <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between gap-4">
        <form onSubmit={handleSearch} className="relative w-full lg:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un fournisseur..." 
            className="pl-10"
          />
        </form>
        
        <div className="flex flex-wrap gap-2">
          {/* أزرار الاستيراد والتصدير */}
          <Button onClick={handleExport} variant="outline" className="bg-white">
            <Download size={16} className="mr-2" /> Exporter
          </Button>
          <Button onClick={() => setIsImportOpen(true)} variant="outline" className="bg-white">
            <Upload size={16} className="mr-2" /> Importer
          </Button>
          
          <Button onClick={() => { setEditingId(null); setIsDialogOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus size={18} className="mr-2" /> Nouveau
          </Button>
        </div>
      </div>

      {/* الجدول */}
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
                  Aucun fournisseur trouvé.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
          <div>Page {currentPage} sur {totalPages}</div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              disabled={currentPage <= 1}
              onClick={() => router.push(`?page=${currentPage - 1}&search=${search}`)}
            >
              Précédent
            </Button>
            <Button 
              variant="outline" 
              disabled={currentPage >= totalPages}
              onClick={() => router.push(`?page=${currentPage + 1}&search=${search}`)}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      {/* نافذة الإضافة/التعديل (CRUD Dialog) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
              <Input id="nom" name="nom" required placeholder="SARL Exemple" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Activité (Optionnel)</label>
              <Input id="activite" name="activite" placeholder="BTP, Informatique..." />
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

      {/* نافذة الاستيراد من Excel (Import Dialog) */}
      <Dialog open={isImportOpen} onOpenChange={(open) => {
        setIsImportOpen(open);
        if(!open) { setImportFile(null); setPreviewData(null); }
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Importer des fournisseurs (Excel)</DialogTitle>
          </DialogHeader>
          
          {!previewData ? (
            <div className="mt-4 space-y-4">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex gap-3">
                <AlertCircle size={20} className="shrink-0" />
                <div>
                  <p className="font-semibold mb-1">Instructions :</p>
                  <ul className="list-disc ml-4 space-y-1">
                    <li>La 1ère ligne doit contenir les titres (Nom, Activité).</li>
                    <li>Le "Nom" est obligatoire. L'activité est optionnelle.</li>
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
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex justify-between items-center">
                <p className="text-sm text-emerald-800 font-medium">
                  {previewData.validRows.length} fournisseur(s) prêt(s) à être importé(s).
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
  );
}