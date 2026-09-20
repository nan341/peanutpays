'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, LogOut } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useSession, signOut } from 'next-auth/react';

export default function Header() {
  const { t, locale, setLocale } = useTranslation();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isLoggedIn = status === 'authenticated' && !!session?.user;
  const [inboxCount, setInboxCount] = useState<number>(0);

  useEffect(() => {
    if (isLoggedIn) {
      fetch('/api/inbox')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.totalCount) {
            setInboxCount(data.totalCount);
          } else {
            setInboxCount(0);
          }
        })
        .catch(() => {});
    }
  }, [isLoggedIn, pathname]);

  const navLinks = [
    { href: '/', label: t('nav.dashboard'), badge: 0 },
    { href: '/transactions', label: t('nav.transactions'), badge: 0 },
    { href: '/lending', label: t('nav.lending'), badge: inboxCount },
    { href: '/chat', label: t('nav.chat'), badge: 0 },
  ];

  return (
    <header className="bg-[#0f2044] border-b border-blue-900 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-white font-semibold">
            <Wallet size={20} className="text-teal-400" />
            <span>BudgetMitra</span>
          </Link>

          {/* Desktop Nav */}
          {isLoggedIn ? (
            <nav className="hidden sm:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    pathname === link.href
                      ? 'bg-teal-600 text-white'
                      : 'text-blue-100 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge > 0 && (
                    <span className="bg-[#f4614d] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {isLoggedIn && session?.user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/profile"
                  className="text-xs text-blue-200 hover:text-white font-medium px-2 py-1 bg-blue-950/60 hover:bg-blue-900/60 rounded border border-blue-800/60 transition-colors"
                  title={t('profile.title')}
                >
                  {session.user.name || session.user.email}
                </Link>
                <button
                  onClick={async () => {
                    await signOut({ redirect: false });
                    window.location.href = '/login';
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-blue-200 hover:text-white bg-blue-900/60 hover:bg-blue-800 border border-blue-700/80 px-2.5 py-1.5 rounded-md transition-colors"
                  title={t('auth.logout')}
                >
                  <LogOut size={14} />
                  <span className="hidden sm:inline">{t('auth.logout')}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/login"
                  className="text-xs font-medium text-blue-100 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                >
                  {t('auth.login')}
                </Link>
                <Link
                  href="/signup"
                  className="text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-md transition-colors"
                >
                  {t('auth.signup')}
                </Link>
              </div>
            )}

            {/* Locale toggle */}
            <button
              onClick={() => setLocale(locale === 'en' ? 'hi' : 'en')}
              className="text-xs font-medium text-blue-200 hover:text-white border border-blue-700 hover:border-blue-500 px-2.5 py-1.5 rounded-md transition-colors"
            >
              {locale === 'en' ? 'हिंदी' : 'English'}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {isLoggedIn ? (
          <div className="flex sm:hidden gap-1 pb-2 overflow-x-auto">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  pathname === link.href
                    ? 'bg-teal-600 text-white'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                <span>{link.label}</span>
                {link.badge > 0 && (
                  <span className="bg-[#f4614d] text-white text-[9px] font-bold px-1 rounded-full">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
