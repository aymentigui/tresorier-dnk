'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export function FluxChart({ data }: { data: any[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => `${val / 1000000}M`} />
          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
          <Bar dataKey="cheques" name="Chèques" fill="#0f766e" radius={[4, 4, 0, 0]} barSize={12} />
          <Bar dataKey="encaissements" name="Encaissements" fill="#99f6e4" radius={[4, 4, 0, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RepartitionChart({ data }: { data: any[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) =>
              new Intl.NumberFormat('fr-DZ', {
                style: 'currency',
                currency: 'DZD',
              }).format(Number(value ?? 0))
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}