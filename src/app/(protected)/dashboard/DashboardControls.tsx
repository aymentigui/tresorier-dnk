'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Filter, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function DashboardControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [start, setStart] = useState(searchParams.get('start') || '');
  const [end, setEnd] = useState(searchParams.get('end') || '');

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    router.push(`/dashboard?${params.toString()}`);
  };

  const resetFilters = () => {
    setStart(''); setEnd('');
    router.push(`/dashboard`);
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    window.location.href = `/api/export/dashboard?${params.toString()}`;
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 items-end">
      <div className="flex flex-wrap gap-2 items-center">
        <div>
          <label className="text-[10px] text-slate-500 font-medium uppercase mb-1 block">Du</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 font-medium uppercase mb-1 block">Au</label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex gap-1 mt-5">
          <Button onClick={applyFilters} size="sm" className="h-9 bg-slate-900 text-white"><Filter size={14} className="mr-1" /> Filtrer</Button>
          <Button onClick={resetFilters} size="icon" variant="outline" className="h-9 w-9"><RefreshCcw size={14} /></Button>
        </div>
      </div>
      
      <Button onClick={handleExport} variant="outline" className="bg-white h-9 mt-5 md:mt-0 md:ml-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
        <Download size={16} className="mr-2" /> Exporter Rapport
      </Button>
    </div>
  );
}