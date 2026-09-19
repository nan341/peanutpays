"use client";

import { useState, useCallback } from "react";
import { PlusCircle, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { categorizeByRules } from "@/lib/categorize-rules";

interface TransactionFormProps {
  onSuccess: () => void;
}

const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Subscriptions",
  "Rent",
  "Other",
];

export default function TransactionForm({ onSuccess }: TransactionFormProps) {
  const { t } = useTranslation();

  const todayStr = new Date().toISOString().split("T")[0];
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("Other");
  const [categorizing, setCategorizing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDescriptionChange = useCallback(async (val: string) => {
    setDescription(val);
    if (val.trim().length < 2) return;

    // 1. Instant local rule-based categorization
    const ruleCategory = categorizeByRules(val);
    if (ruleCategory) {
      setCategory(ruleCategory);
      return;
    }

    // 2. AI categorization via backend Groq route
    if (val.trim().length >= 3) {
      setCategorizing(true);
      try {
        const res = await fetch("/api/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: val }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.category) {
            setCategory(data.category);
          }
        }
      } catch {
        // Keep current category on error
      } finally {
        setCategorizing(false);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!description.trim() || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please fill in a valid description and amount.");
      return;
    }

    if (date && date > todayStr) {
      setError(t("transactions.dateFutureError"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          amount: parseFloat(amount),
          category,
          type,
          date: date ? new Date(date).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save transaction");
      }

      setDescription("");
      setAmount("");
      setDate(todayStr);
      setType("expense");
      setCategory("Other");
      setOpen(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save transaction. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded-md transition-colors"
      >
        <PlusCircle size={18} />
        {t("dashboard.quickAdd")}
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#0f2044]">{t("transactions.add")}</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type toggle */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          {(["expense", "income"] as const).map((t2) => (
            <button
              key={t2}
              type="button"
              onClick={() => setType(t2)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                type === t2
                  ? t2 === "expense"
                    ? "bg-[#f4614d] text-white"
                    : "bg-teal-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t2 === "expense" ? t("transactions.type.expense") : t("transactions.type.income")}
            </button>
          ))}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("transactions.description")}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            placeholder="e.g. Swiggy order, metro card"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
          />
        </div>

        {/* Category selection */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t("transactions.category")}:
          </label>
          <div className="flex flex-wrap gap-2 items-center">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium border transition-colors ${
                  category === cat
                    ? "bg-teal-50 border-teal-600 text-teal-800 font-semibold"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {cat}
              </button>
            ))}
            {categorizing && (
              <span className="text-xs text-gray-400 italic">
                {t("transactions.categorizing")}
              </span>
            )}
          </div>
        </div>

        {/* Amount & Date row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("transactions.amount")} (INR)
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("transactions.date")}
            </label>
            <input
              type="date"
              max={todayStr}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
            />
          </div>
        </div>

        {error && <p className="text-sm text-[#f4614d]">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 rounded-md transition-colors text-sm shadow-sm"
          >
            {loading ? "Saving..." : t("transactions.submit")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-600 hover:bg-gray-50"
          >
            {t("transactions.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
