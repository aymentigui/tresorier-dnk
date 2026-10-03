'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction } from './actions';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const res = await loginAction(formData);

    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else if (res.success) {
      router.push('/dashboard');
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-100">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">TreasuryFlow</h1>
          <p className="text-sm text-slate-500 mt-2">Connectez-vous à votre espace</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nom d'utilisateur</label>
            <input
              type="text"
              name="username"
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
            <input
              type="password"
              name="password"
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white py-2.5 px-4 rounded-lg hover:bg-slate-800 transition font-medium disabled:opacity-70 mt-4"
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}