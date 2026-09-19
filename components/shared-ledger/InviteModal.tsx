'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface InviteModalProps {
  groupId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

interface AcceptedConnection {
  otherUser: {
    id: string;
    displayName: string;
    handle: string;
  };
}

export default function InviteModal({
  groupId,
  existingMemberIds,
  onClose,
  onSuccess,
}: InviteModalProps) {
  const { t } = useTranslation();
  const [availableFriends, setAvailableFriends] = useState<{ id: string; name: string }[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/connections');
        if (res.ok) {
          const conns = await res.json();
          const existingSet = new Set(existingMemberIds);
          const available = (conns.accepted as AcceptedConnection[] || [])
            .filter((c) => !existingSet.has(c.otherUser.id))
            .map((c) => ({
              id: c.otherUser.id,
              name: `${c.otherUser.displayName} (@${c.otherUser.handle})`,
            }));
          setAvailableFriends(available);
        }
      } catch {}
    }
    load();
  }, [existingMemberIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInvitees.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeUserIds: selectedInvitees }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send invites');
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
    <div className="bg-white border-2 border-gray-400 rounded-lg p-5 shadow-md">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-[#0f2044] text-sm">{t('shared.inviteFriends')}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {availableFriends.length === 0 ? (
          <p className="text-xs text-gray-500 py-2">
            No new connected friends available to invite. Add friends by handle in the Friends tab first.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {availableFriends.map((f) => {
              const isChecked = selectedInvitees.includes(f.id);
              return (
                <label key={f.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer p-1.5 hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedInvitees([...selectedInvitees, f.id]);
                      } else {
                        setSelectedInvitees(selectedInvitees.filter((id) => id !== f.id));
                      }
                    }}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>{f.name}</span>
                </label>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-[#f4614d]">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || selectedInvitees.length === 0}
            className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 rounded-md text-sm transition-colors"
          >
            {loading ? 'Inviting...' : 'Send Invitations'}
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
