"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface SpendingChartProps {
  breakdown: Record<string, number>;
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f59e0b",
  Transport: "#0ea5e9",
  Shopping: "#a855f7",
  Subscriptions: "#ec4899",
  Rent: "#f97316",
  Other: "#9ca3af",
};

export default function SpendingChart({ breakdown }: SpendingChartProps) {
  const { t } = useTranslation();

  const data = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        {t("dashboard.noTransactions")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `\u20B9${v}`}
        />
        <Tooltip
          formatter={(value: unknown) => [
            `\u20B9${Number(value ?? 0).toLocaleString("en-IN")}`,
            "Spend",
          ]}
          cursor={{ fill: "#f0fdfa" }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={CATEGORY_COLORS[entry.name] ?? "#9ca3af"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
