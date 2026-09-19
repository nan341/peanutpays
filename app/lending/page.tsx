"use client";

import { useCallback, useEffect, useState } from "react";
import LendingLedger from "@/components/LendingLedger";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface LendingEntry {
  id: number;
  amount: number;
  direction: "lent" | "borrowed";
  note?: string | null;
  date: string;
  settled: boolean;
}

interface Friend {
  id: number;
  name: string;
  netBalance: number;
  entries: LendingEntry[];
}

export default function LendingPage() {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lending");
      setFriends(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-[#0f2044]">{t("lending.title")}</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <LendingLedger friends={friends} onUpdate={fetchFriends} />
      )}
    </div>
  );
}
