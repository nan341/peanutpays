'use client';

import { useCallback, useEffect, useState } from 'react';
import LendingLedger from '@/components/LendingLedger';
import FriendsTab from '@/components/FriendsTab';
import GroupsTab from '@/components/GroupsTab';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { User, Users, UserCheck } from 'lucide-react';

interface LendingEntry {
  id: number;
  amount: number;
  direction: 'lent' | 'borrowed';
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

type TabType = 'personal' | 'friends' | 'groups';

export default function LendingPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch('/api/lending', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        setError(t('lending.error'));
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setFriends(data);
      } else {
        setFriends([]);
      }
    } catch {
      setError(t('lending.error'));
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab === 'personal') {
      fetchFriends();
    }
  }, [activeTab, fetchFriends]);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'personal', label: t('lending.tab.personal'), icon: <User size={16} /> },
    { id: 'friends', label: t('lending.tab.friends'), icon: <UserCheck size={16} /> },
    { id: 'groups', label: t('lending.tab.groups'), icon: <Users size={16} /> },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-[#0f2044]">{t('lending.title')}</h1>

      {/* Underlined Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  isActive
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === 'personal' && (
        <div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-[#f4614d] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <span>{error}</span>
              <button
                onClick={fetchFriends}
                className="px-3.5 py-1.5 bg-[#0f2044] hover:bg-[#1a365d] text-white text-xs font-medium rounded transition-colors shrink-0"
              >
                {t('lending.tryAgain')}
              </button>
            </div>
          ) : (
            <LendingLedger friends={friends} onUpdate={fetchFriends} />
          )}
        </div>
      )}

      {activeTab === 'friends' && <FriendsTab />}

      {activeTab === 'groups' && <GroupsTab />}
    </div>
  );
}
