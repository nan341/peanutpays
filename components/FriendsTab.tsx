'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { UserPlus, Check, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface ConnectionItem {
  id: string;
  createdAt: string;
  otherUser: {
    id: string;
    displayName: string;
    handle: string;
  };
  directGroupId: string | null;
  netBalancePaise: number;
}

interface IncomingItem {
  id: string;
  createdAt: string;
  requester: {
    id: string;
    displayName: string;
    handle: string;
  };
}

interface OutgoingItem {
  id: string;
  createdAt: string;
  addressee: {
    id: string;
    displayName: string;
    handle: string;
  };
}

export default function FriendsTab() {
  const { t } = useTranslation();
  const [handle, setHandle] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [accepted, setAccepted] = useState<ConnectionItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingItem[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/connections');
      if (res.ok) {
        const data = await res.json();
        setAccepted(data.accepted || []);
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim().toLowerCase() }),
      });
      const data = await res.json();
      setFeedback(data.message || 'If this handle exists, a connection request has been sent.');
      setHandle('');
      fetchConnections();
    } catch {
      setFeedback('If this handle exists, a connection request has been sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (connectionId: string, action: 'accept' | 'decline') => {
    setLoadingAction(`${action}-${connectionId}`);
    try {
      await fetch('/api/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, action }),
      });
      fetchConnections();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async (connectionId: string) => {
    setLoadingAction(`cancel-${connectionId}`);
    try {
      await fetch(`/api/connections?id=${encodeURIComponent(connectionId)}`, {
        method: 'DELETE',
      });
      fetchConnections();
    } finally {
      setLoadingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Friend Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#0f2044] mb-2">{t('friends.addByHandle')}</h3>
        <form onSubmit={handleSendRequest} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('friends.handlePlaceholder')}
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
            />
            <button
              type="submit"
              disabled={submitting || !handle.trim()}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              <UserPlus size={16} />
              <span>{submitting ? t('friends.sending') : t('friends.sendRequest')}</span>
            </button>
          </div>
          <p className="text-xs text-gray-500">{t('friends.handleHint')}</p>
          {feedback && (
            <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded p-2 mt-2">
              {feedback}
            </p>
          )}
        </form>
      </div>

      {/* Incoming Requests */}
      {incoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            {t('friends.pendingIncoming')} ({incoming.length})
          </h3>
          <div className="space-y-2">
            {incoming.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-md p-3"
              >
                <div>
                  <p className="text-sm font-medium text-[#0f2044]">{item.requester.displayName}</p>
                  <p className="text-xs text-gray-500">@{item.requester.handle}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(item.id, 'accept')}
                    disabled={loadingAction === `accept-${item.id}`}
                    className="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  >
                    <Check size={14} />
                    <span>{t('friends.accept')}</span>
                  </button>
                  <button
                    onClick={() => handleRespond(item.id, 'decline')}
                    disabled={loadingAction === `decline-${item.id}`}
                    className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  >
                    <X size={14} />
                    <span>{t('friends.decline')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing Requests */}
      {outgoing.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            {t('friends.pendingOutgoing')} ({outgoing.length})
          </h3>
          <div className="space-y-2">
            {outgoing.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-md p-3"
              >
                <div>
                  <p className="text-sm font-medium text-[#0f2044]">{item.addressee.displayName}</p>
                  <p className="text-xs text-gray-500">@{item.addressee.handle}</p>
                </div>
                <button
                  onClick={() => handleCancel(item.id)}
                  disabled={loadingAction === `cancel-${item.id}`}
                  className="text-xs text-gray-500 hover:text-[#f4614d] border border-gray-200 hover:border-red-300 rounded px-2.5 py-1 transition-colors"
                >
                  {t('friends.cancel')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected Friends */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          {t('friends.connected')} ({accepted.length})
        </h3>

        {accepted.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t('friends.noFriends')}</p>
        ) : (
          <div className="space-y-2">
            {accepted.map((conn) => {
              const netRupees = Math.abs(conn.netBalancePaise) / 100;
              const formattedAmount = `₹${netRupees.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;

              return (
                <div
                  key={conn.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-md p-3.5 hover:border-gray-300 transition-colors"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-[#0f2044]">
                      {conn.otherUser.displayName}
                    </h4>
                    <p className="text-xs text-gray-500">@{conn.otherUser.handle}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {conn.netBalancePaise > 0 ? (
                        <p className="text-xs font-semibold text-teal-700 flex items-center gap-1 justify-end">
                          <ArrowDownLeft size={14} />
                          <span>{t('lending.owesYou')} {formattedAmount}</span>
                        </p>
                      ) : conn.netBalancePaise < 0 ? (
                        <p className="text-xs font-semibold text-[#f4614d] flex items-center gap-1 justify-end">
                          <ArrowUpRight size={14} />
                          <span>{t('lending.youOwe')} {formattedAmount}</span>
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-gray-400">{t('friends.settled')}</p>
                      )}
                    </div>

                    {conn.directGroupId && (
                      <Link
                        href={`/lending/shared/${conn.directGroupId}`}
                        className="text-xs font-medium bg-[#0f2044] hover:bg-blue-900 text-white px-3 py-1.5 rounded-md transition-colors"
                      >
                        {t('friends.openLedger')}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
