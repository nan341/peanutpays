import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/useTranslation";
import Header from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BudgetMitra - Personal Budget Tracker",
  description:
    "Track your spending, manage lending, and get AI-powered saving tips. Your financial data stays on your device.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#f8fafc] min-h-screen`}>
        <I18nProvider>
          <Header />
          <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
