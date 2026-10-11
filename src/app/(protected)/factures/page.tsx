import { getFactures, getFournisseursList, getBonsCommandesList, getContratsList } from './actions';
import FacturesClient from './FacturesClient';

export default async function FacturesPage({
  searchParams,
}: {
  searchParams: Promise<any>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams?.page) || 1;
  
  const filters = {
    page, limit: 10,
    search: resolvedParams?.search || '',
    fournisseurId: resolvedParams?.fournisseurId || '',
    statut: resolvedParams?.statut || '',
    rattachement: resolvedParams?.rattachement || '',
    bonCommandeId: resolvedParams?.bonCommandeId || '',
    contratId: resolvedParams?.contratId || '',
    dateDebut: resolvedParams?.dateDebut || '',
    dateFin: resolvedParams?.dateFin || '',
    montantMin: resolvedParams?.montantMin || '',
    montantMax: resolvedParams?.montantMax || '',
  };
  
  const [facturesData, fournisseursList, bcsList, contratsList] = await Promise.all([
    getFactures(filters),
    getFournisseursList(),
    getBonsCommandesList(),
    getContratsList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Factures & Filtres Pro</h1>
          <p className="text-slate-500 mt-1">Gestion, import intelligent et export intégral des factures.</p>
        </div>
      </div>
      
      <FacturesClient 
        initialData={facturesData.data as any} 
        summary={facturesData.summary}
        total={facturesData.total} 
        totalPages={facturesData.totalPages} 
        currentPage={page} 
        currentFilters={filters}
        fournisseurs={fournisseursList}
        bonsCommandes={bcsList}
        contrats={contratsList}
      />
    </div>
  );
}