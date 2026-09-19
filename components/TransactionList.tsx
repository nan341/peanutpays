"use client";

import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { CategoryBadge } from "@/components/ui/Badge";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface Transaction {
  id: number;
  amount: number;
  description: string;
  category: string;
  type: "income" | "expense";
  date: string;
}

interface TransactionListProps {
  transactions: Transaction[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function TransactionList({ transactions }: TransactionListProps) {
  const { t } = useTranslation();

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">{t("transactions.empty")}</div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {transactions.map((txn) => (
        <li key={txn.id} className="flex items-center justify-between py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0">
              {txn.type === "income" ? (
                <ArrowUpCircle size={20} className="text-teal-600" />
              ) : (
                <ArrowDownCircle size={20} className="text-[#f4614d]" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#0f2044] truncate">{txn.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <CategoryBadge category={txn.category} />
                <span className="text-xs text-gray-400">{formatDate(txn.date)}</span>
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 text-sm font-semibold ${
              txn.type === "income" ? "text-teal-600" : "text-[#f4614d]"
            }`}
          >
            {txn.type === "income" ? "+" : "-"}
            {"\u20B9"}
            {txn.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </li>
      ))}
    </ul>
  );
}
