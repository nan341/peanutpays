"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function Header() {
  const { t, locale, setLocale } = useTranslation();
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/transactions", label: t("nav.transactions") },
    { href: "/lending", label: t("nav.lending") },
    { href: "/chat", label: t("nav.chat") },
  ];

  return (
    <header className="bg-[#0f2044] border-b border-blue-900">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-white font-semibold">
            <Wallet size={20} className="text-teal-400" />
            <span>BudgetMitra</span>
          </Link>

          {/* Nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-teal-600 text-white"
                    : "text-blue-100 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Locale toggle */}
          <button
            onClick={() => setLocale(locale === "en" ? "hi" : "en")}
            className="text-sm font-medium text-blue-200 hover:text-white border border-blue-700 hover:border-blue-500 px-3 py-1 rounded-md transition-colors"
          >
            {locale === "en" ? "हिंदी" : "English"}
          </button>
        </div>

        {/* Mobile nav */}
        <div className="flex sm:hidden gap-1 pb-2 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                pathname === link.href
                  ? "bg-teal-600 text-white"
                  : "text-blue-200 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
