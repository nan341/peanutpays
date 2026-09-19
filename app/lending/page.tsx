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

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/lending');
      if (res.ok) {
        setFriends(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
