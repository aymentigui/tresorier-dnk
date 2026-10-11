import { getFournisseurProfile } from '../actions';
import FournisseurProfileClient from './FournisseurProfileClient';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function FournisseurProfilePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const profile = await getFournisseurProfile(resolvedParams.id);

  if (!profile) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/fournisseurs">
          <Button variant="outline" size="icon" className="bg-white">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profil Fournisseur</h1>
          <p className="text-slate-500 mt-1">Vue 360° des activités financières et contrats liés.</p>
        </div>
      </div>
      
      <FournisseurProfileClient profile={profile} />
    </div>
  );
}