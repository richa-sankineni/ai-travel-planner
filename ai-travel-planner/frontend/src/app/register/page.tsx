'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registerUser, setToken } from '../../utils/api';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await registerUser(email, password);
      setToken(res.data.token);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-8"
      >
        <h2 className="text-2xl font-bold text-white">Create your account</h2>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 6 characters)"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition"
        >
          {loading ? 'Creating account…' : 'Sign Up'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <p className="text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
