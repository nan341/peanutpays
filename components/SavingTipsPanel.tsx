"use client";

import { useEffect, useState } from "react";
import { Lightbulb, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function SavingTipsPanel() {
  const { t } = useTranslation();
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchTips = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/tips");
      const data = await res.json();
      setTips(data.tips ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTips();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[#0f2044] flex items-center gap-2">
          <Lightbulb size={16} className="text-amber-500" />
          {t("dashboard.savingTips")}
        </h3>
        <button
          onClick={fetchTips}
          className="text-gray-400 hover:text-teal-600 transition-colors"
          title="Refresh tips"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-md animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-gray-400">Could not load tips right now.</p>
      )}

      {!loading && !error && (
        <ul className="space-y-2">
          {tips.map((tip, i) => (
            <li
              key={i}
              className="bg-teal-50 border border-teal-100 rounded-md px-3 py-2.5 text-sm text-teal-900"
            >
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
