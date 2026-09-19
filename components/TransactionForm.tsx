"use client";

import { useState, useCallback } from "react";
import { PlusCircle, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { CategoryBadge } from "@/components/ui/Badge";

interface TransactionFormProps {
  onSuccess: () => void;
}

export default function TransactionForm({ onSuccess }: TransactionFormProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("Other");
  const [categorizing, setCategorizing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDescriptionChange = useCallback(async (val: string) => {
    setDescription(val);
    if (val.length < 3) return;
    setCategorizing(true);
    try {
      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: val }),
      });
      const data = await res.json();
      setCategory(data.category ?? "Other");
    } catch {
      // keep current category on error
    } finally {
      setCategorizing(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!description || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please fill in a valid description and amount.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amount: parseFloat(amount),
          type,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setDescription("");
      setAmount("");
      setType("expense");
      setCategory("Other");
      setOpen(false);
      onSuccess();
    } catch {
      setError("Could not save transaction. Please try again.");
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
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
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
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Category preview */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t("transactions.category")}:</span>
          {categorizing ? (
            <span className="text-xs text-gray-400 italic">{t("transactions.categorizing")}</span>
          ) : (
            <CategoryBadge category={category} />
          )}
        </div>

        {/* Amount */}
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
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {error && <p className="text-sm text-[#f4614d]">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 rounded-md transition-colors text-sm"
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
