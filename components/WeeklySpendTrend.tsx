"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface WeeklyTrendProps {
  thisWeekSpend: number;
  lastWeekSpend: number;
}

export default function WeeklySpendTrend({
  thisWeekSpend,
  lastWeekSpend,
}: WeeklyTrendProps) {
  const { t } = useTranslation();

  const maxSpend = Math.max(1, thisWeekSpend, lastWeekSpend);
  const thisWeekHeight = Math.max(12, Math.round((thisWeekSpend / maxSpend) * 100));
  const lastWeekHeight = Math.max(12, Math.round((lastWeekSpend / maxSpend) * 100));

  let pctChange = 0;
  let isUp = false;
  let isDown = false;

  if (lastWeekSpend > 0) {
    pctChange = Math.round(((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100);
    isUp = pctChange > 0;
    isDown = pctChange < 0;
  } else if (thisWeekSpend > 0) {
    pctChange = 100;
    isUp = true;
  }

  const fmt = (v: number) =>
    `\u20B9${v.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#0f2044]">{t("budget.weeklyTrendTitle")}</h2>
        <div className="flex items-center gap-1 text-xs font-semibold">
          {isUp && (
            <span className="inline-flex items-center gap-0.5 text-[#f4614d] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
              <TrendingUp size={12} /> {t("budget.upVsLastWeek", { pct: Math.abs(pctChange) })}
            </span>
          )}
          {isDown && (
            <span className="inline-flex items-center gap-0.5 text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
              <TrendingDown size={12} /> {t("budget.downVsLastWeek", { pct: Math.abs(pctChange) })}
            </span>
          )}
          {!isUp && !isDown && (
            <span className="inline-flex items-center gap-0.5 text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
              <Minus size={12} /> {t("budget.sameVsLastWeek")}
            </span>
          )}
        </div>
      </div>

      {/* Bar visual comparison */}
      <div className="h-32 flex items-end justify-center gap-8 sm:gap-12 pt-4 pb-2 border-b border-gray-100">
        {/* Last Week Bar */}
        <div className="flex flex-col items-center gap-1.5 w-20">
          <span className="text-[11px] font-bold text-gray-600">{fmt(lastWeekSpend)}</span>
          <div className="w-full bg-gray-100 rounded-t-md h-24 flex items-end">
            <div
              className="w-full bg-[#0f2044] rounded-t-md transition-all duration-300"
              style={{ height: `${lastWeekHeight}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500">{t("budget.lastWeek")}</span>
        </div>

        {/* This Week Bar */}
        <div className="flex flex-col items-center gap-1.5 w-20">
          <span className="text-[11px] font-bold text-[#0f2044]">{fmt(thisWeekSpend)}</span>
          <div className="w-full bg-gray-100 rounded-t-md h-24 flex items-end">
            <div
              className={`w-full rounded-t-md transition-all duration-300 ${
                isUp ? "bg-[#f4614d]" : "bg-teal-600"
              }`}
              style={{ height: `${thisWeekHeight}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-900">{t("budget.thisWeek")}</span>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-gray-400 text-center">
        {t("budget.trendNote")}
      </div>
    </div>
  );
}
