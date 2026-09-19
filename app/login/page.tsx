'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (!res || res.error) {
        if (res?.status === 429) {
          setError(t('auth.rateLimited'));
        } else {
          setError(t('auth.invalidCredentials'));
        }
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h1 className="text-2xl font-bold text-[#0f2044] mb-2">{t('auth.loginTitle')}</h1>
      <p className="text-sm text-gray-600 mb-6">
        {t('auth.noAccount')}{' '}
        <Link href="/signup" className="text-teal-700 hover:underline font-medium">
          {t('auth.signup')}
        </Link>
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-[#f4614d] flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
            {t('auth.email')}
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
            {t('auth.password')}
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-md text-sm transition-colors disabled:opacity-50"
        >
          {loading ? t('auth.loggingIn') : t('auth.login')}
        </button>
      </form>
    </div>
  );
}
