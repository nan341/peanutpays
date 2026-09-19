"use client";

import { useState } from "react";
import { PlusCircle, Check, X } from "lucide-react";
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

interface LendingLedgerProps {
  friends: Friend[];
  onUpdate: () => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export default function LendingLedger({ friends, onUpdate }: LendingLedgerProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!friendName || !amount || Number(amount) <= 0) {
      setError("Please fill in friend name and a valid amount.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/lending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendName, amount: parseFloat(amount), direction, note }),
      });
      if (!res.ok) throw new Error();
      setFriendName("");
      setAmount("");
      setNote("");
      setDirection("lent");
      setShowForm(false);
      onUpdate();
    } catch {
      setError("Could not save entry. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const settle = async (entryId: number) => {
    setSettling(entryId);
    try {
      await fetch("/api/lending", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      onUpdate();
    } finally {
      setSettling(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add entry button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded-md transition-colors text-sm"
        >
          <PlusCircle size={16} />
          {t("lending.addEntry")}
        </button>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium text-[#0f2044] text-sm">{t("lending.addEntry")}</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder={t("lending.friendName")}
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />

            {/* Direction toggle */}
            <div className="flex rounded-md border border-gray-200 overflow-hidden">
              {(["lent", "borrowed"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    direction === d
                      ? d === "lent"
                        ? "bg-teal-600 text-white"
                        : "bg-[#f4614d] text-white"
                      : "bg-white text-gray-600"
                  }`}
                >
                  {d === "lent"
                    ? t("lending.direction.lent")
                    : t("lending.direction.borrowed")}
                </button>
              ))}
            </div>

            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount (INR)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="text"
              placeholder={t("lending.note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {error && <p className="text-xs text-[#f4614d]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 rounded-md text-sm"
              >
                {loading ? "Saving..." : t("lending.submit")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-600"
              >
                {t("lending.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Friend cards */}
      {friends.length === 0 && (
        <p className="text-sm text-gray-400 py-4">{t("lending.empty")}</p>
      )}

      {friends.map((friend) => (
        <div key={friend.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-medium text-[#0f2044]">{friend.name}</span>
            <span
              className={`text-sm font-semibold ${
                friend.netBalance > 0
                  ? "text-teal-600"
                  : friend.netBalance < 0
                  ? "text-[#f4614d]"
                  : "text-gray-400"
              }`}
            >
              {friend.netBalance === 0
                ? "Settled"
                : friend.netBalance > 0
                ? `${t("lending.owesYou")} \u20B9${Math.abs(friend.netBalance).toLocaleString("en-IN")}`
                : `${t("lending.youOwe")} \u20B9${Math.abs(friend.netBalance).toLocaleString("en-IN")}`}
            </span>
          </div>
          <ul className="divide-y divide-gray-50">
            {friend.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span
                    className={`text-xs font-medium ${
                      entry.direction === "lent" ? "text-teal-700" : "text-[#f4614d]"
                    }`}
                  >
                    {entry.direction === "lent" ? "Lent" : "Borrowed"}
                  </span>
                  {entry.note && (
                    <span className="text-xs text-gray-400 ml-2">{entry.note}</span>
                  )}
                  <span className="text-xs text-gray-400 ml-2">{formatDate(entry.date)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[#0f2044]">
                    {"\u20B9"}
                    {entry.amount.toLocaleString("en-IN")}
                  </span>
                  <button
                    onClick={() => settle(entry.id)}
                    disabled={settling === entry.id}
                    className="flex items-center gap-1 text-xs text-teal-700 border border-teal-200 rounded px-2 py-0.5 hover:bg-teal-50 disabled:opacity-50 transition-colors"
                  >
                    <Check size={12} />
                    {settling === entry.id ? "..." : t("lending.settle")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
