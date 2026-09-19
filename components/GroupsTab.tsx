'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Users, Plus, Check, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface GroupItem {
  role: 'admin' | 'member';
  status: 'invited' | 'active';
  joinedAt: string;
  myNetBalancePaise: number;
  memberCount: number;
  group: {
    id: string;
    name: string;
    type: 'direct' | 'group';
    createdBy: string;
    createdAt: string;
  };
}

export default function GroupsTab() {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setGroups(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create group');
        return;
      }
      setGroupName('');
      setShowCreate(false);
      fetchGroups();
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setCreating(false);
    }
  };

  const handleRespondInvite = async (groupId: string, action: 'accept' | 'decline') => {
    setLoadingAction(`${action}-${groupId}`);
    try {
      await fetch(`/api/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchGroups();
    } finally {
      setLoadingAction(null);
    }
  };

  const activeGroups = groups.filter((g) => g.status === 'active');
  const invitedGroups = groups.filter((g) => g.status === 'invited');

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
      {/* Create Group Button / Form */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded-md transition-colors text-sm"
        >
          <Plus size={16} />
          <span>{t('groups.createGroup')}</span>
        </button>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-[#0f2044] text-sm">{t('groups.createGroup')}</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCreateGroup} className="space-y-3">
            <input
              type="text"
              required
              maxLength={40}
              placeholder={t('groups.groupName')}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
            />
            {error && <p className="text-xs text-[#f4614d]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !groupName.trim()}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-1.5 px-4 rounded-md text-sm transition-colors"
              >
                {creating ? t('groups.creating') : t('groups.create')}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-600 hover:bg-gray-50"
              >
                {t('shared.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invitations */}
      {invitedGroups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            {t('groups.invites')} ({invitedGroups.length})
          </h3>
          <div className="space-y-2">
            {invitedGroups.map((item) => (
              <div
                key={item.group.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-md p-3.5"
              >
                <div>
                  <h4 className="text-sm font-semibold text-[#0f2044]">{item.group.name}</h4>
                  <p className="text-xs text-gray-500">Group invitation</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespondInvite(item.group.id, 'accept')}
                    disabled={loadingAction === `accept-${item.group.id}`}
                    className="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  >
                    <Check size={14} />
                    <span>{t('friends.accept')}</span>
                  </button>
                  <button
                    onClick={() => handleRespondInvite(item.group.id, 'decline')}
                    disabled={loadingAction === `decline-${item.group.id}`}
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

      {/* Active Groups List */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          {t('groups.myGroups')} ({activeGroups.length})
        </h3>

        {activeGroups.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t('groups.noGroups')}</p>
        ) : (
          <div className="space-y-2">
            {activeGroups.map((item) => {
              const netRupees = Math.abs(item.myNetBalancePaise) / 100;
              const formattedAmount = `₹${netRupees.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;

              return (
                <div
                  key={item.group.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-md p-3.5 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-blue-50 text-[#0f2044] flex items-center justify-center font-bold text-sm">
                      <Users size={18} className="text-teal-700" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[#0f2044]">{item.group.name}</h4>
                      <p className="text-xs text-gray-500">
                        {t('groups.membersCount', { count: item.memberCount })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {item.myNetBalancePaise > 0 ? (
                        <p className="text-xs font-semibold text-teal-700 flex items-center gap-1 justify-end">
                          <ArrowDownLeft size={14} />
                          <span>{t('lending.owesYou')} {formattedAmount}</span>
                        </p>
                      ) : item.myNetBalancePaise < 0 ? (
                        <p className="text-xs font-semibold text-[#f4614d] flex items-center gap-1 justify-end">
                          <ArrowUpRight size={14} />
                          <span>{t('lending.youOwe')} {formattedAmount}</span>
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-gray-400">{t('friends.settled')}</p>
                      )}
                    </div>

                    <Link
                      href={`/lending/shared/${item.group.id}`}
                      className="text-xs font-medium bg-[#0f2044] hover:bg-blue-900 text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      {t('friends.openLedger')}
                    </Link>
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
