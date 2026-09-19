"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingDown, TrendingUp, Scale } from "lucide-react";
import TransactionForm from "@/components/TransactionForm";
import TransactionList from "@/components/TransactionList";
import SpendingChart from "@/components/SpendingChart";
import SavingTipsPanel from "@/components/SavingTipsPanel";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface Transaction {
  id: number;
  amount: number;
  description: string;
  category: string;
  type: "income" | "expense";
  date: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        <Icon size={16} className={color} />
      </div>
      <p className="text-xl font-bold text-[#0f2044]">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearLoading, setClearLoading] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transactions");
      setTransactions(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Current month stats
  const now = new Date();
  const thisMonthTxns = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const income = thisMonthTxns
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expenses = thisMonthTxns
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const breakdown: Record<string, number> = {};
  for (const t of thisMonthTxns.filter((t) => t.type === "expense")) {
    breakdown[t.category] = (breakdown[t.category] ?? 0) + t.amount;
  }

  const fmt = (v: number) =>
    `\u20B9${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const clearData = async () => {
    const confirmed = window.confirm(t("settings.clearConfirm"));
    if (!confirmed) return;
    setClearLoading(true);
    try {
      await fetch("/api/data", { method: "DELETE" });
      setTransactions([]);
    } finally {
      setClearLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#0f2044]">
          {t("dashboard.title")} &mdash; {t("dashboard.thisMonth")}
        </h1>
        <TransactionForm onSuccess={fetchTransactions} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label={t("dashboard.totalIncome")}
          value={fmt(income)}
          icon={TrendingUp}
          color="text-teal-600"
        />
        <StatCard
          label={t("dashboard.totalExpenses")}
          value={fmt(expenses)}
          icon={TrendingDown}
          color="text-[#f4614d]"
        />
        <StatCard
          label={t("dashboard.netBalance")}
          value={fmt(income - expenses)}
          icon={Scale}
          color={income - expenses >= 0 ? "text-teal-600" : "text-[#f4614d]"}
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-[#0f2044] mb-3">
          {t("dashboard.spendingByCategory")}
        </h2>
        {loading ? (
          <div className="h-40 bg-gray-100 rounded animate-pulse" />
        ) : (
          <SpendingChart breakdown={breakdown} />
        )}
      </div>

      {/* Bottom row: saving tips + recent transactions */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SavingTipsPanel />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-[#0f2044] mb-3">Recent Transactions</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <TransactionList transactions={transactions.slice(0, 5)} />
          )}
        </div>
      </div>

      {/* Clear data */}
      <div className="text-right">
        <button
          onClick={clearData}
          disabled={clearLoading}
          className="text-xs text-gray-400 hover:text-[#f4614d] transition-colors underline"
        >
          {clearLoading ? "Clearing..." : t("settings.clearData")}
        </button>
      </div>
    </div>
  );
}
