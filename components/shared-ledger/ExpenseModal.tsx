'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface Member {
  userId: string;
  displayName: string;
}

interface ExpenseModalProps {
  groupId: string;
  currentUserId: string;
  activeMembers: Member[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExpenseModal({
  groupId,
  currentUserId,
  activeMembers,
  onClose,
  onSuccess,
}: ExpenseModalProps) {
  const { t } = useTranslation();
  const [totalRupees, setTotalRupees] = useState('');
  const [note, setNote] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    activeMembers.map((m) => m.userId)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(totalRupees);
    if (!amountNum || amountNum <= 0 || selectedParticipants.length === 0) {
      setError('Please enter a valid amount and select at least one participant.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'split',
          totalRupees: amountNum,
          participantIds: selectedParticipants,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add expense');
        return;
      }
      onSuccess();
    } catch {
      setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-2 border-teal-600 rounded-lg p-5 shadow-md">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-[#0f2044] text-sm">{t('shared.addExpense')}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('shared.amount')}</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max="1000000"
            required
            placeholder="0.00"
            value={totalRupees}
            onChange={(e) => setTotalRupees(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('shared.note')}</label>
          <input
            type="text"
            maxLength={100}
            placeholder="e.g. Dinner, Grocery, WiFi bill"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {t('shared.selectParticipants')} ({selectedParticipants.length})
          </label>
          <div className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 p-3 rounded-md max-h-40 overflow-y-auto">
            {activeMembers.map((m) => {
              const isChecked = selectedParticipants.includes(m.userId);
              return (
                <label key={m.userId} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedParticipants([...selectedParticipants, m.userId]);
                      } else {
                        setSelectedParticipants(selectedParticipants.filter((id) => id !== m.userId));
                      }
                    }}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>{m.displayName} {m.userId === currentUserId ? '(You)' : ''}</span>
                </label>
              );
            })}
          </div>
        </div>

        {error && <p className="text-xs text-[#f4614d]">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 rounded-md text-sm transition-colors"
          >
            {loading ? t('shared.saving') : t('shared.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('shared.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
