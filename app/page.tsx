"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingDown, TrendingUp, Scale, Sliders, Plus, Trash2 } from "lucide-react";
import TransactionForm from "@/components/TransactionForm";
import TransactionList from "@/components/TransactionList";
import SpendingChart from "@/components/SpendingChart";
import WeeklySpendTrend from "@/components/WeeklySpendTrend";
import SafeToSpendCard from "@/components/SafeToSpendCard";
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

interface BudgetLimit {
  id: string;
  category: string;
  monthlyLimit: number;
}

const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Subscriptions",
  "Rent",
  "Other",
];

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
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
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
  const [budgetLimits, setBudgetLimits] = useState<BudgetLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearLoading, setClearLoading] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState("Food");
  const [editingAmount, setEditingAmount] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transactions");
      if (res.ok) {
        setTransactions(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBudgetLimits = useCallback(async () => {
    try {
      const res = await fetch("/api/budget-limits");
      if (res.ok) {
        setBudgetLimits(await res.json());
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchBudgetLimits();
  }, [fetchTransactions, fetchBudgetLimits]);

  // Current month stats & safe-to-spend days
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);

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

  // Weekly Spend Trend calculation (Monday to Sunday)
  const currentDayOfWeek = now.getDay();
  const distanceToMonday = (currentDayOfWeek + 6) % 7;
  const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
  const endOfLastWeek = new Date(startOfThisWeek.getTime() - 1);

  const thisWeekSpend = transactions
    .filter((t) => {
      if (t.type !== "expense") return false;
      const d = new Date(t.date);
      return d >= startOfThisWeek && d <= now;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const lastWeekSpend = transactions
    .filter((t) => {
      if (t.type !== "expense") return false;
      const d = new Date(t.date);
      return d >= startOfLastWeek && d <= endOfLastWeek;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const fmt = (v: number) =>
    `\u20B9${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const handleSaveBudgetLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAmount || isNaN(Number(editingAmount)) || Number(editingAmount) <= 0) return;
    setSavingLimit(true);
    try {
      const res = await fetch("/api/budget-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: editingCategory,
          monthlyLimit: parseFloat(editingAmount),
        }),
      });
      if (res.ok) {
        await fetchBudgetLimits();
        setEditingAmount("");
      }
    } finally {
      setSavingLimit(false);
    }
  };

  const handleDeleteBudgetLimit = async (cat: string) => {
    try {
      const res = await fetch(`/api/budget-limits?category=${encodeURIComponent(cat)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchBudgetLimits();
      }
    } catch {
      // silent
    }
  };

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
          {t("dashboard.title")} - {t("dashboard.thisMonth")}
        </h1>
        <TransactionForm onSuccess={fetchTransactions} />
      </div>

      {/* Prominent Safe to Spend Today Card */}
      <SafeToSpendCard
        income={income}
        expenses={expenses}
        daysRemaining={daysRemaining}
      />

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

      {/* Charts Grid: Category Spending + Weekly Spend Trend */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Category Breakdown Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0f2044] mb-3">
            {t("dashboard.spendingByCategory")}
          </h2>
          {loading ? (
            <div className="h-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <SpendingChart breakdown={breakdown} />
          )}
        </div>

        {/* Weekly Trend Bar Chart */}
        <WeeklySpendTrend
          thisWeekSpend={thisWeekSpend}
          lastWeekSpend={lastWeekSpend}
        />
      </div>

      {/* Per-Category Budget Limits Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0f2044] flex items-center gap-1.5">
              <Sliders size={16} className="text-teal-600" />
              {t("budget.monthlyLimitsTitle")}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("budget.monthlyLimitsHint")}
            </p>
          </div>
          <button
            onClick={() => setShowLimitModal(!showLimitModal)}
            className="text-xs font-medium text-teal-600 hover:text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1"
          >
            {showLimitModal ? t("budget.hideLimits") : t("budget.manageLimits")}
          </button>
        </div>

        {/* Limit Editor Form */}
        {showLimitModal && (
          <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              {t("budget.setLimitTitle")}
            </h3>
            <form onSubmit={handleSaveBudgetLimit} className="flex flex-wrap gap-2.5 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-gray-600 mb-1">{t("transactions.category")}</label>
                <select
                  value={editingCategory}
                  onChange={(e) => setEditingCategory(e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-gray-600 mb-1">{t("budget.limitAmount")}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editingAmount}
                  onChange={(e) => setEditingAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                  className="w-full text-xs border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800"
                />
              </div>
              <button
                type="submit"
                disabled={savingLimit}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-1"
              >
                <Plus size={14} />
                {savingLimit ? t("budget.savingLimit") : t("budget.saveLimit")}
              </button>
            </form>
          </div>
        )}

        {/* Progress Bars */}
        {budgetLimits.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-200 rounded-md text-gray-400 text-xs">
            {t("budget.noLimitsSet")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgetLimits.map((b) => {
              const spent = breakdown[b.category] || 0;
              const ratio = spent / b.monthlyLimit;
              const pct = Math.round(ratio * 100);
              const isOver = pct > 100;
              const isWarning = pct >= 80 && pct <= 100;

              let barColor = "bg-teal-500";
              let badgeBg = "bg-teal-50 text-teal-700 border-teal-200";
              let statusLabel = t("budget.used", { pct });

              if (isOver) {
                barColor = "bg-[#f4614d]";
                badgeBg = "bg-red-50 text-red-700 border-red-200 font-semibold";
                statusLabel = t("budget.overBy", {
                  amount: fmt(spent - b.monthlyLimit),
                  pct,
                });
              } else if (isWarning) {
                barColor = "bg-amber-500";
                badgeBg = "bg-amber-50 text-amber-700 border-amber-200 font-semibold";
                statusLabel = t("budget.nearLimit", { pct });
              }

              return (
                <div key={b.id} className="p-3.5 border border-gray-100 rounded-lg bg-gray-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#0f2044]">{b.category}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeBg}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {fmt(spent)} / <span className="font-medium text-gray-700">{fmt(b.monthlyLimit)}</span>
                      </span>
                      {showLimitModal && (
                        <button
                          onClick={() => handleDeleteBudgetLimit(b.category)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove Limit"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar container */}
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom row: saving tips + recent transactions */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <SavingTipsPanel />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0f2044] mb-3">{t("budget.recentTransactions")}</h2>
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
