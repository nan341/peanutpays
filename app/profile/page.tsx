'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { User, QrCode, Shield, CheckCircle2, AlertCircle, Trash2, Key } from 'lucide-react';

interface ProfileData {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  upiId: string | null;
  upiIdUpdatedAt: string | null;
}

export default function ProfilePage() {
  const { t } = useTranslation();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upiInput, setUpiInput] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'remove'>('save');

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data: ProfileData = await res.json();
        setProfile(data);
        setUpiInput(data.upiId || '');
      }
    } catch {
      setFeedback({ type: 'error', message: t('auth.serverError') });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!upiInput.trim()) {
      setFeedback({ type: 'error', message: t('profile.upiRequired') });
      return;
    }
    setPendingAction('save');
    setPassword('');
    setShowPasswordModal(true);
  };

  const handleRemoveClick = () => {
    setFeedback(null);
    setPendingAction('remove');
    setPassword('');
    setShowPasswordModal(true);
  };

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const payload = {
        upiId: pendingAction === 'save' ? upiInput.trim() : null,
        currentPassword: password,
      };

      const res = await fetch('/api/profile/upi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || t('profile.updateFailed') });
        return;
      }

      setShowPasswordModal(false);
      setPassword('');
      setFeedback({
        type: 'success',
        message: pendingAction === 'save' ? t('profile.upiSaved') : t('profile.upiRemoved'),
      });
      fetchProfile();
    } catch {
      setFeedback({ type: 'error', message: t('auth.serverError') });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 bg-gray-100 rounded w-1/3 animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <User size={22} className="text-teal-700" />
        <h1 className="text-xl font-bold text-[#0f2044]">{t('profile.title')}</h1>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-md text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-teal-50 border border-teal-200 text-teal-900'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={16} className="text-teal-700 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-[#f4614d] shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Account Info Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-[#0f2044] flex items-center gap-2">
          <Shield size={16} className="text-teal-700" />
          <span>{t('profile.accountInfo')}</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div>
            <span className="text-gray-500 font-medium block mb-0.5">{t('auth.displayName')}</span>
            <span className="font-semibold text-gray-900">{profile?.displayName}</span>
          </div>
          <div>
            <span className="text-gray-500 font-medium block mb-0.5">{t('auth.handle')}</span>
            <span className="font-semibold text-gray-900 font-mono">@{profile?.handle}</span>
          </div>
          <div>
            <span className="text-gray-500 font-medium block mb-0.5">{t('auth.email')}</span>
            <span className="font-semibold text-gray-900">{profile?.email}</span>
          </div>
        </div>
      </div>

      {/* UPI Settings Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0f2044] flex items-center gap-2">
            <QrCode size={16} className="text-teal-700" />
            <span>{t('profile.upiTitle')}</span>
          </h2>
          {profile?.upiId && (
            <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
              {t('profile.upiConfigured')}
            </span>
          )}
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          {t('profile.upiExplanation')}
        </p>

        <form onSubmit={handleSaveClick} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#0f2044] mb-1">
              {t('profile.upiLabel')}
            </label>
            <input
              type="text"
              placeholder="e.g. username@okhdfcbank"
              value={upiInput}
              onChange={(e) => setUpiInput(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {t('profile.upiPrivacyNotice')}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors shadow-sm"
            >
              {t('profile.saveUpi')}
            </button>

            {profile?.upiId && (
              <button
                type="button"
                onClick={handleRemoveClick}
                className="flex items-center gap-1 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 border border-gray-300 hover:border-red-200 text-xs font-medium px-3 py-2 rounded-md transition-colors"
              >
                <Trash2 size={13} />
                <span>{t('profile.removeUpi')}</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-gray-200 max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-[#0f2044]">
              <Key size={18} className="text-teal-700" />
              <h3 className="text-sm font-bold">{t('profile.confirmPasswordTitle')}</h3>
            </div>

            <p className="text-xs text-gray-600">
              {pendingAction === 'save'
                ? t('profile.enterPasswordToSave')
                : t('profile.enterPasswordToRemove')}
            </p>

            <form onSubmit={handleConfirmAction} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassword('');
                  }}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {t('shared.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !password}
                  className="px-4 py-1.5 bg-[#0f2044] hover:bg-blue-900 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  {submitting ? t('auth.submitting') : t('profile.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
