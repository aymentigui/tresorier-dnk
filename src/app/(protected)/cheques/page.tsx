import { getCheques, getFournisseursList, getFacturesForCheques, getContratsList } from './actions';
import ChequesClient from './ChequesClient';

export default async function ChequesPage({
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
    dateEmissionDebut: resolvedParams?.dateEmissionDebut || '',
    dateEmissionFin: resolvedParams?.dateEmissionFin || '',
    dateEncaissementDebut: resolvedParams?.dateEncaissementDebut || '',
    dateEncaissementFin: resolvedParams?.dateEncaissementFin || '',
    montantMin: resolvedParams?.montantMin || '',
    montantMax: resolvedParams?.montantMax || '',
    factureId: resolvedParams?.factureId || '',
    contratId: resolvedParams?.contratId || '',
  };
  
  const [chequesData, fournisseursList, facturesList, contratsList] = await Promise.all([
    getCheques(filters),
    getFournisseursList(),
    getFacturesForCheques(),
    getContratsList()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chèques & Filtres Pro</h1>
          <p className="text-slate-500 mt-1">Analyse détaillée, filtres avancés et export intégral.</p>
        </div>
      </div>
      
      <ChequesClient 
        initialData={chequesData.data as any} 
        summary={chequesData.summary}
        total={chequesData.total} 
        totalPages={chequesData.totalPages} 
        currentPage={page} 
        currentFilters={filters}
        fournisseurs={fournisseursList}
        factures={facturesList}
        contrats={contratsList}
      />
    </div>
  );
}