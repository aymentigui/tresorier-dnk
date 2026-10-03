import { getDashboardData } from './actions';
import { FluxChart, RepartitionChart } from './DashboardCharts';
import DashboardControls from './DashboardControls'; // المكون الجديد
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Wallet, TrendingUp, AlertCircle, Users, Building, ArrowRight } from 'lucide-react';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);
  
  const resolvedParams = await searchParams;
  const start = resolvedParams?.start || '';
  const end = resolvedParams?.end || '';
  
  const data = await getDashboardData(start, end);

  const formatMoney = (val: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(val);
  const formatDate = (date: string | Date) => new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* الرأس مع أدوات التصفية والتصدير */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Bonjour {session?.username}, voici votre trésorerie.
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Période : {formatDate(data.period.start)} au {formatDate(data.period.end)}
          </p>
        </div>
        <DashboardControls />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
          <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600 w-fit"><Wallet size={20} /></div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">Solde actuel en banque</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{formatMoney(data.treasury.soldeActuel)}</p>
            <p className="text-[10px] text-slate-400 mt-1">{data.treasury.dateSolde ? `Au ${formatDate(data.treasury.dateSolde)}` : 'Aucun solde actif'}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
          <div className={`p-2 rounded-lg w-fit ${data.treasury.disponibilite < 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">Disponibilité projetée</p>
            <p className={`text-xl font-bold tabular-nums ${data.treasury.disponibilite < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatMoney(data.treasury.disponibilite)}</p>
          </div>
        </div>

        <Link href={`/cheques?statut=en_circulation`} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 hover:border-amber-300 transition-colors cursor-pointer block">
          <div className="bg-amber-50 p-2 rounded-lg text-amber-600 w-fit"><AlertCircle size={20} /></div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">Chèques en circulation (Période)</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{formatMoney(data.kpis.chequesCircSum)}</p>
            <p className="text-[10px] text-amber-600 font-medium mt-1">{data.kpis.chequesCircCount} chèques</p>
          </div>
        </Link>

        <Link href={`/encaissements?statut=en_circulation`} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 hover:border-indigo-300 transition-colors cursor-pointer block">
          <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600 w-fit"><AlertCircle size={20} /></div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">Encaissements en attente (Période)</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{formatMoney(data.kpis.encaissementsCircSum)}</p>
            <p className="text-[10px] text-indigo-600 font-medium mt-1">{data.kpis.encaissementsCircCount} encaissements</p>
          </div>
        </Link>
      </div>

      {/* الرسوم البيانية */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
          <h2 className="text-base font-bold text-slate-900 mb-6">Flux de trésorerie (Évolution)</h2>
          <FluxChart data={data.chartData} />
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">Répartition des sorties</h2>
          <div className="flex justify-center mb-4"><RepartitionChart data={data.pieData} /></div>
          <div className="space-y-3">
            {data.pieData.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }}></div>
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-medium text-slate-900 tabular-nums">{formatMoney(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* الجزء السفلي */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-base font-bold text-slate-900">Derniers chèques enregistrés</h2>
            <Link href="/cheques" className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">Voir tout <ArrowRight size={14} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 bg-slate-50/50 uppercase font-semibold">
                <tr><th className="px-5 py-3">N° Chèque</th><th className="px-5 py-3">Fournisseur</th><th className="px-5 py-3">Montant</th><th className="px-5 py-3">Statut</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.derniersCheques.map(cheque => (
                  <tr key={cheque.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{cheque.numeroCheque}</td>
                    <td className="px-5 py-3 text-slate-600">{cheque.fournisseur.nom}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{formatMoney(Number(cheque.montant))}</td>
                    <td className="px-5 py-3">
                      {cheque.dateDecaissement ? <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-100 text-emerald-700">Décaissé</span> : <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-medium bg-amber-100 text-amber-700">En circulation</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Indicateurs de la base</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-500 flex items-center gap-1"><Users size={14} /> Clients</span><span className="font-bold text-slate-900">{data.kpis.clientsCount}</span></div>
              <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '70%' }}></div></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-500 flex items-center gap-1"><Building size={14} /> Fournisseurs</span><span className="font-bold text-slate-900">{data.kpis.fournisseursCount}</span></div>
              <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '45%' }}></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}