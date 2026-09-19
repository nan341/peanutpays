"use client";

import { ShieldCheck, AlertCircle, Calendar } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface SafeToSpendProps {
  income: number;
  expenses: number;
  daysRemaining: number;
}

export default function SafeToSpendCard({
  income,
  expenses,
  daysRemaining,
}: SafeToSpendProps) {
  const { t } = useTranslation();

  const remainingBalance = income - expenses;
  const isOverspent = income > 0 && remainingBalance <= 0;
  const noIncome = income <= 0;

  const safePerDay = Math.max(0, Math.floor(remainingBalance / Math.max(1, daysRemaining)));

  const fmt = (v: number) =>
    `\u20B9${v.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

  return (
    <div className="bg-[#0f2044] text-white rounded-lg p-5 shadow-sm border border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldCheck size={18} className="text-teal-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-200">
              {t("budget.safeToSpendTitle")}
            </span>
          </div>

          {noIncome ? (
            <div>
              <p className="text-lg font-bold text-teal-100">
                {t("budget.logIncomePrompt")}
              </p>
              <p className="text-xs text-teal-200/80 mt-1">
                {t("budget.logIncomeHint", { spent: fmt(expenses) })}
              </p>
            </div>
          ) : isOverspent ? (
            <div className="flex items-start gap-2">
              <AlertCircle size={20} className="text-[#f4614d] shrink-0 mt-0.5" />
              <div>
                <p className="text-base font-bold text-red-200">
                  {t("budget.overspentTitle")}
                </p>
                <p className="text-xs text-teal-200/80 mt-0.5">
                  {t("budget.overspentHint", {
                    spent: fmt(expenses),
                    income: fmt(income),
                    deficit: fmt(Math.abs(remainingBalance)),
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-white">
                  {fmt(safePerDay)}
                </span>
                <span className="text-xs text-teal-300 font-medium">{t("budget.perDay")}</span>
              </div>
              <p className="text-xs text-teal-200/90 mt-1">
                {t("budget.safeHint", {
                  income: fmt(income),
                  spent: fmt(expenses),
                  days: daysRemaining,
                })}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center bg-white/10 px-3.5 py-2 rounded-md border border-white/15 text-xs text-teal-100 shrink-0">
          <Calendar size={15} className="text-teal-300" />
          <span>{t("budget.daysLeft", { days: daysRemaining })}</span>
        </div>
      </div>
    </div>
  );
}
