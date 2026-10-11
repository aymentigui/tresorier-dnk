'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Bell, Menu, LogOut, LayoutDashboard, Wallet, Receipt, CreditCard, 
  ArrowDownToLine, ArrowUpFromLine, Users, Building2, 
  ShieldCheck, UserCog, History, 
  FileText,
  FileSignature,
  List
} from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';

export default function Topbar({ user }: { user: { username: string } }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // نفس الروابط الموجودة في الـ Sidebar
  const menuSections = [
    {
      title: "Général",
      items: [{ name: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard }]
    },
    {
      title: "Trésorerie",
      items: [
        { name: "Soldes bancaires", href: "/soldes", icon: Wallet },
        { name: "Chèques", href: "/cheques", icon: CreditCard },
        { name: "Encaissements", href: "/encaissements", icon: ArrowDownToLine },
        { name: "Lignes de crédit", href: "/lignes-credit", icon: ArrowUpFromLine },
        { name: "Frais & Taxes", href: "/frais", icon: List },
        { name: "Bons de Commande", href: "/bons-commande", icon: FileText },
        { name: 'Soldes bancaires', href: '/soldes', icon: FileText },
        { name: "Contrats", href: "/contrats", icon: FileSignature },
        { name: "Factures", href: "/factures", icon: Receipt },
      ]
    },
    {
      title: "Tiers",
      items: [
        { name: "Fournisseurs", href: "/fournisseurs", icon: Building2 },
        { name: "Clients", href: "/clients", icon: Users },
      ]
    },
    {
      title: "Administration",
      items: [
        { name: "Utilisateurs", href: "/utilisateurs", icon: UserCog },
        { name: "Rôles & Permissions", href: "/roles", icon: ShieldCheck },
        { name: "Journal d&aposaudit", href: "/logs", icon: History },
      ]
    }
  ];

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        
        {/* قائمة الموبايل (Sheet) */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <Menu size={20} />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-slate-900 text-slate-300 border-none flex flex-col">
            <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
            
            {/* اللوجو في الموبايل */}
            <div className="h-16 flex items-center px-6 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2 text-white font-bold text-xl">
                <Wallet className="text-emerald-500" />
                Treasury<span className="text-emerald-500">Flow</span>
              </div>
            </div>

            {/* الروابط */}
            <div className="flex-1 overflow-y-auto py-4 scrollbar-thin scrollbar-thumb-slate-700">
              {menuSections.map((section, idx) => (
                <div key={idx} className="mb-6 px-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                    {section.title}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname.startsWith(item.href);
                      const Icon = item.icon;
                      
                      return (
                        <li key={item.href}>
                          <Link 
                            href={item.href} 
                            onClick={() => setIsOpen(false)} // نغلق القائمة تلقائيا كي يكليكي
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                              isActive 
                                ? 'bg-emerald-600/10 text-emerald-400' 
                                : 'hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <Icon size={18} className={isActive ? 'text-emerald-400' : 'text-slate-400'} />
                            {item.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        {/* تاريخ اليوم (يظهر في الديسكتوب فقط) */}
        <div className="hidden md:block">
          <p className="text-sm font-medium text-slate-500 capitalize">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <Bell size={20} />
        </button>
        
        <div className="h-8 w-px bg-slate-200 mx-2"></div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-semibold text-slate-700">{user.username}</span>
            <span className="text-xs text-slate-500">Connecté</span>
          </div>
          <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200">
            {user.username.substring(0, 2).toUpperCase()}
          </div>
          
          <form action={logoutAction}>
            <button type="submit" className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2" title="Déconnexion">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}