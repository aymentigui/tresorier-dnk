'use client';

import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, CreditCard, ArrowDownToLine, 
  Users, Briefcase, List, FileText, Building, 
  ShieldCheck, History, Settings, 
  FileSignature,
  Receipt
} from 'lucide-react';
import Link from 'next/link';

const menuItems = [
  { group: 'PRINCIPAL', items: [
    { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Chèques', href: '/cheques', icon: CreditCard },
    { name: 'Encaissements', href: '/encaissements', icon: ArrowDownToLine },
    { name: 'Fournisseurs', href: '/fournisseurs', icon: Building },
    { name: 'Clients', href: '/clients', icon: Users },
    { name: 'Lignes de crédit', href: '/lignes-credit', icon: Briefcase },
    { name: 'Frais', href: '/frais', icon: List },
    { name: "Bons de Commande", href: "/bons-commande", icon: FileText },
    { name: 'Soldes bancaires', href: '/soldes', icon: FileText },
    { name: "Contrats", href: "/contrats", icon: FileSignature },
    { name: "Factures", href: "/factures", icon: Receipt }
  ]},
  { group: 'ADMINISTRATION', items: [
    { name: 'Utilisateurs', href: '/utilisateurs', icon: ShieldCheck },
    { name: "Rôles & Permissions", href: "/roles", icon: ShieldCheck },
    { name: 'Journal d\'audit', href: '/logs', icon: History },
  ]}
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col hidden md:flex flex-shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-700 p-1.5 rounded text-white">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">TreasuryFlow</h1>
            <p className="text-[10px] text-slate-500 font-medium">GESTION FINANCIÈRE</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {menuItems.map((group, idx) => (
          <div key={idx}>
            <p className="px-3 text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              {group.group}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                      isActive 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <item.icon size={18} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Sidebar */}
      <div className="p-4 border-t border-slate-200">
        {/* <button className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-slate-600 hover:bg-slate-50 transition-colors text-sm font-medium">
          <Settings size={18} className="text-slate-400" />
          Paramètres
        </button> */}
      </div>
    </aside>
  );
}