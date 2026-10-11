'use client';

import { useState } from 'react';
import { Building2, FileText, FileSignature, Receipt, Landmark, Eye, History } from 'lucide-react';

export type FournisseurContrat = {
  id: string;
  numero: string;
  designation?: string | null;
  date: Date | string;
  montant: number;
  isActive: boolean;
  parent?: { numero: string } | null;
};

export type FournisseurBonCommande = {
  id: string;
  numero: string;
  designation?: string | null;
  date: Date | string;
  montant: number;
};

export type FournisseurFacture = {
  id: string;
  numero: string;
  statut: string;
  montant: number;
  pourcentage: number;
  bonCommande?: { numero: string } | null;
  contrat?: { numero: string } | null;
};

export type FournisseurCheque = {
  id: string;
  numeroCheque: string;
  statut: string;
  montant: number;
};

export type FournisseurAuditLog = {
  id: string;
  createdAt: Date | string;
  username?: string | null;
  description: string;
  action: string;
  before?: unknown;
  after?: unknown;
};

export type FournisseurProfileData = {
  id: string;
  nom: string;
  activite?: string | null;
  cumulMontant: number;
  seuil: number;
  seuilActive: boolean;
  contrats: FournisseurContrat[];
  bonCommandes: FournisseurBonCommande[];
  factures: FournisseurFacture[];
  cheques: FournisseurCheque[];
  logs?: FournisseurAuditLog[];
};

export default function FournisseurProfileClient({ profile }: { profile: FournisseurProfileData }) {
  const [activeTab, setActiveTab] = useState<'overview'|'bc'|'contrats'|'factures'|'cheques'|'historique'>('overview');

  const formatMontant = (m: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(m);
  const formatDate = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR');
  const formatDateTime = (d: Date | string) => new Date(d).toLocaleString('fr-FR');

  const pctSeuil = profile.seuilActive && profile.seuil > 0 ? (profile.cumulMontant / profile.seuil) * 100 : 0;
  const isAlert = pctSeuil >= 90;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[70vh]">
      
      {/* --- HEADER 360° --- */}
      <div className={`p-8 relative overflow-hidden ${isAlert ? 'bg-red-900' : 'bg-slate-900'} text-white shrink-0`}>
        <Building2 size={180} className="absolute -bottom-10 -right-10 opacity-5 text-white" />
        <h2 className="text-3xl font-bold relative z-10">{profile.nom}</h2>
        <p className="text-slate-300 text-sm mt-2 mb-8 relative z-10">{profile.activite || 'Aucune activité spécifiée'}</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Cumul Engagé (Chèques Validés)</p>
            <p className="text-3xl font-bold tabular-nums text-white">{formatMontant(profile.cumulMontant)}</p>
          </div>
          {profile.seuilActive && (
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                Seuil Global d&aposalerte 
                {isAlert && <span className="bg-red-500 text-white px-2 py-0.5 rounded text-[10px]">DÉPASSÉ OU CRITIQUE</span>}
              </p>
              <p className={`text-3xl font-bold tabular-nums ${isAlert ? 'text-red-300' : 'text-emerald-400'}`}>
                {formatMontant(profile.seuil)}
              </p>
              <div className="w-full max-w-sm bg-slate-800 rounded-full h-2 mt-3">
                <div className={`h-2 rounded-full transition-all ${isAlert ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pctSeuil, 100)}%` }}></div>
              </div>
              <p className="text-[11px] mt-2 text-slate-300 font-medium">{pctSeuil.toFixed(2)}% du seuil consommé</p>
            </div>
          )}
        </div>
      </div>

      {/* --- TABS NAVIGATION --- */}
      <div className="flex border-b border-slate-200 bg-slate-50 shrink-0 px-2 overflow-x-auto">
        <button onClick={() => setActiveTab('overview')} className={`px-6 py-4 text-sm font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
          <Eye size={18}/> Vue d&apos;ensemble
        </button>
        <button onClick={() => setActiveTab('contrats')} className={`px-6 py-4 text-sm font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'contrats' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
          <FileSignature size={18}/> Contrats <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{profile.contrats.length}</span>
        </button>
        <button onClick={() => setActiveTab('bc')} className={`px-6 py-4 text-sm font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'bc' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
          <FileText size={18}/> BC <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{profile.bonCommandes.length}</span>
        </button>
        <button onClick={() => setActiveTab('factures')} className={`px-6 py-4 text-sm font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'factures' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
          <Receipt size={18}/> Factures <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{profile.factures.length}</span>
        </button>
        <button onClick={() => setActiveTab('cheques')} className={`px-6 py-4 text-sm font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'cheques' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
          <Landmark size={18}/> Chèques <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{profile.cheques.length}</span>
        </button>
        <button onClick={() => setActiveTab('historique')} className={`px-6 py-4 text-sm font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'historique' ? 'border-amber-600 text-amber-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
          <History size={18}/> Historique <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{profile.logs?.length || 0}</span>
        </button>
      </div>

      {/* --- TABS CONTENT --- */}
      <div className="flex-1 p-6 md:p-8 bg-white">
        
        {/* ONGLET 1 : OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col gap-3">
              <div className="bg-indigo-100 w-12 h-12 rounded-full flex items-center justify-center text-indigo-600"><FileSignature size={24}/></div>
              <div><p className="text-3xl font-bold text-slate-900">{profile.contrats.filter((c: FournisseurContrat) => c.isActive).length}</p><p className="text-sm font-medium text-slate-500">Contrats Actifs</p></div>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col gap-3">
              <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center text-blue-600"><FileText size={24}/></div>
              <div><p className="text-3xl font-bold text-slate-900">{profile.bonCommandes.length}</p><p className="text-sm font-medium text-slate-500">Bons de Commande</p></div>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col gap-3">
              <div className="bg-amber-100 w-12 h-12 rounded-full flex items-center justify-center text-amber-600"><Receipt size={24}/></div>
              <div><p className="text-3xl font-bold text-slate-900">{profile.factures.filter((f: FournisseurFacture) => f.statut !== 'PAYEE').length}</p><p className="text-sm font-medium text-slate-500">Factures Impayées / Part.</p></div>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col gap-3">
              <div className="bg-emerald-100 w-12 h-12 rounded-full flex items-center justify-center text-emerald-600"><Landmark size={24}/></div>
              <div><p className="text-3xl font-bold text-slate-900">{profile.cheques.filter((c: FournisseurCheque) => c.statut === 'EN_CIRCULATION').length}</p><p className="text-sm font-medium text-slate-500">Chèques en Circulation</p></div>
            </div>
          </div>
        )}

        {activeTab === 'contrats' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {profile.contrats.map((c: FournisseurContrat) => (
              <div key={c.id} className={`p-5 rounded-2xl border shadow-sm ${!c.isActive ? 'bg-slate-50 opacity-70 border-slate-200' : 'bg-white border-indigo-200'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                      {c.numero} {c.parent && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Renouvelé</span>}
                    </h4>
                    <p className="text-sm text-slate-500 mt-1">{c.designation || 'Sans description'}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${c.isActive ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'}`}>{c.isActive ? 'ACTIF' : 'ARCHIVÉ'}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                  <div><p className="text-xs text-slate-500 mb-1">Date</p><p className="font-semibold text-slate-900">{formatDate(c.date)}</p></div>
                  <div><p className="text-xs text-slate-500 mb-1">Montant</p><p className="font-bold tabular-nums text-slate-900">{formatMontant(c.montant)}</p></div>
                </div>
              </div>
            ))}
            {profile.contrats.length === 0 && <p className="text-slate-500 italic col-span-full">Aucun contrat.</p>}
          </div>
        )}

        {activeTab === 'bc' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {profile.bonCommandes.map((bonCommande: FournisseurBonCommande) => (
              <div
                key={bonCommande.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <h4 className="font-bold text-slate-900 text-lg">
                    {bonCommande.numero}
                  </h4>

                  <p className="text-sm text-slate-500 mt-1">
                    {bonCommande.designation || '-'}
                  </p>
                </div>

                <div className="mt-4 flex justify-between items-end">
                  <p className="text-xs text-slate-400">
                    {formatDate(bonCommande.date)}
                  </p>

                  <span className="font-bold tabular-nums text-slate-900">
                    {formatMontant(bonCommande.montant)}
                  </span>
                </div>
              </div>
            ))}
            {profile.bonCommandes.length === 0 && <p className="text-slate-500 italic col-span-full">Aucun Bon de Commande.</p>}
          </div>
        )}

        {activeTab === 'factures' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {profile.factures.map((f: FournisseurFacture) => (
              <div key={f.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div><h4 className="font-bold text-slate-900 text-lg">{f.numero}</h4><p className="text-xs font-medium text-blue-600 mt-1">{f.bonCommande ? `BC N° ${f.bonCommande.numero}` : f.contrat ? `Contrat N° ${f.contrat.numero}` : 'Indépendante'}</p></div>
                  <span className="font-bold tabular-nums text-slate-900 text-lg">{formatMontant(f.montant)}</span>
                </div>
                <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${f.statut === 'PAYEE' ? 'bg-emerald-100 text-emerald-800' : f.statut === 'PARTIELLEMENT_PAYEE' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{f.statut.replace('_', ' ')}</span>
                  <span className="text-xs font-bold text-slate-600">Payé: {f.pourcentage}%</span>
                </div>
              </div>
            ))}
            {profile.factures.length === 0 && <p className="text-slate-500 italic col-span-full">Aucune facture.</p>}
          </div>
        )}

        {activeTab === 'cheques' && (
          <div className="space-y-3">
            {profile.cheques.map((c: FournisseurCheque) => (
              <div key={c.id} className={`bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center ${c.statut === 'ANNULE' ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                <div>
                  <h4 className={`font-bold ${c.statut === 'ANNULE' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{c.numeroCheque}</h4>
                  <p className="text-xs text-slate-500 mt-1">{c.statut}</p>
                </div>
                <span className={`font-bold tabular-nums ${c.statut === 'ANNULE' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatMontant(c.montant)}</span>
              </div>
            ))}
            {profile.cheques.length === 0 && <p className="text-slate-500 italic">Aucun chèque émis.</p>}
          </div>
        )}

        {/* ONGLET 6 : HISTORIQUE */}
        {activeTab === 'historique' && (
          <div className="space-y-4">
            {profile.logs?.length === 0 ? (
              <p className="text-slate-500 italic">Aucun historique disponible pour ce fournisseur.</p>
            ) : (
              <div className="border-l-2 border-slate-200 ml-3 space-y-6">
                {profile.logs?.map((log: FournisseurAuditLog) => (
                  <div key={log.id} className="relative pl-6">
                    <div className="absolute w-3 h-3 bg-amber-500 rounded-full -left-[7px] top-1"></div>
                    <p className="text-xs text-slate-400 mb-1">{formatDateTime(log.createdAt)} par <strong className="text-slate-700">{log.username}</strong></p>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-sm font-bold text-slate-900">{log.description}</p>
                      
                      {/* Affichage des détails si c'est une modification de Seuil/Cumul */}
                      {log.action === 'UPDATE' && Boolean(log.before) && Boolean(log.after) && ((): React.ReactNode => {
                        const before = log.before as { cumulMontant?: number; seuil?: number; seuilActive?: boolean } | null;
                        const after = log.after as { cumulMontant?: number; seuil?: number; seuilActive?: boolean } | null;
                        if (!before || !after || before.cumulMontant === undefined) return null;
                        return (
                          <div className="mt-3 bg-slate-50 p-3 rounded-lg text-xs font-mono grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-slate-400 mb-1">Anciennes Valeurs</p>
                              <p className="text-red-500">Cumul: {formatMontant(before.cumulMontant)}</p>
                              <p className="text-red-500">Seuil: {before.seuilActive && before.seuil ? formatMontant(before.seuil) : 'Désactivé'}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-1">Nouvelles Valeurs</p>
                              <p className="text-emerald-600">Cumul: {formatMontant(after.cumulMontant ?? 0)}</p>
                              <p className="text-emerald-600">Seuil: {after.seuilActive && after.seuil ? formatMontant(after.seuil) : 'Désactivé'}</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
