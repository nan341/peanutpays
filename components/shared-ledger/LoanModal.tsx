'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface Member {
  userId: string;
  displayName: string;
  handle: string;
}

interface LoanModalProps {
  groupId: string;
  currentUserId: string;
  isDirect: boolean;
  activeMembers: Member[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function LoanModal({
  groupId,
  currentUserId,
  isDirect,
  activeMembers,
  onClose,
  onSuccess,
}: LoanModalProps) {
  const { t } = useTranslation();
  const otherMembers = activeMembers.filter((m) => m.userId !== currentUserId);
  const [otherUserId, setOtherUserId] = useState(otherMembers[0]?.userId || '');
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent');
  const [amountRupees, setAmountRupees] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amountRupees);
    if (!amountNum || amountNum <= 0 || !otherUserId) {
      setError('Please select a member and enter a valid amount.');
      return;
    }

    const lenderId = direction === 'lent' ? currentUserId : otherUserId;
    const borrowerId = direction === 'lent' ? otherUserId : currentUserId;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'loan',
          lenderId,
          borrowerId,
          amountRupees: amountNum,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to record loan');
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
    <div className="bg-white border-2 border-blue-900 rounded-lg p-5 shadow-md">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-[#0f2044] text-sm">{t('shared.recordLoan')}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isDirect && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Select Member</label>
            <select
              value={otherUserId}
              onChange={(e) => setOtherUserId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              {otherMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName} (@{m.handle})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('lending.direction')}</label>
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setDirection('lent')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                direction === 'lent' ? 'bg-teal-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {t('lending.direction.lent')}
            </button>
            <button
              type="button"
              onClick={() => setDirection('borrowed')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                direction === 'borrowed' ? 'bg-[#f4614d] text-white' : 'bg-white text-gray-600'
              }`}
            >
              {t('lending.direction.borrowed')}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('shared.amount')}</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max="1000000"
            required
            placeholder="0.00"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('shared.note')}</label>
          <input
            type="text"
            maxLength={100}
            placeholder="e.g. Cab fare, Snack"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
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
