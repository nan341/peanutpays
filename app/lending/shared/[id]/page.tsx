'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import ExpenseModal from '@/components/shared-ledger/ExpenseModal';
import LoanModal from '@/components/shared-ledger/LoanModal';
import InviteModal from '@/components/shared-ledger/InviteModal';
import {
  ArrowLeft,
  PlusCircle,
  CreditCard,
  Check,
  X,
  Copy,
  Trash2,
  LogOut,
  UserPlus,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

interface Member {
  userId: string;
  role: 'admin' | 'member';
  status: 'invited' | 'active';
  displayName: string;
  handle: string;
  email: string;
}

interface Entry {
  id: string;
  groupId: string;
  lenderId: string;
  borrowerId: string;
  paise: number;
  kind: 'loan' | 'payment';
  status: 'pending' | 'confirmed';
  note: string | null;
  batchId: string | null;
  upiRef: string | null;
  createdBy: string;
  createdAt: string;
  lenderName: string;
  borrowerName: string;
  creatorName: string;
}

interface SettlePlanItem {
  from: string;
  to: string;
  paise: number;
}

interface PairwiseItem {
  from: string;
  to: string;
  paise: number;
}

interface GroupDetails {
  group: {
    id: string;
    name: string;
    type: 'direct' | 'group';
    createdBy: string;
    createdAt: string;
  };
  myMembership: {
    groupId: string;
    userId: string;
    role: 'admin' | 'member';
    status: 'invited' | 'active';
    joinedAt: string;
  };
  members?: Member[];
  entries?: Entry[];
  pendingPayments?: Entry[];
  nets?: Record<string, number>;
  pairwise?: PairwiseItem[];
  plan?: SettlePlanItem[];
  inviter?: {
    id: string;
    displayName: string;
    handle: string;
  };
}

function formatINR(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SharedLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [data, setData] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeModal, setActiveModal] = useState<'expense' | 'loan' | 'invite' | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [payingTo, setPayingTo] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/groups/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Group not found or you are not a member.');
        } else {
          setError('Failed to load shared ledger.');
        }
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError('An error occurred while loading this ledger.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  const handleRecordPayment = async (creditorId: string, suggestedPaise: number) => {
    const rawVal = paymentAmounts[creditorId];
    const amountRupees = rawVal !== undefined && rawVal !== '' ? parseFloat(rawVal) : suggestedPaise / 100;

    if (!amountRupees || amountRupees <= 0) return;

    setPayingTo(creditorId);
    try {
      const res = await fetch(`/api/groups/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment',
          payeeId: creditorId,
          amountRupees,
        }),
      });
      if (res.ok) {
        setPaymentAmounts((prev) => ({ ...prev, [creditorId]: '' }));
        fetchGroup();
      }
    } finally {
      setPayingTo(null);
    }
  };

  const handlePaymentAction = async (entryId: string, action: 'confirm' | 'reject') => {
    try {
      await fetch(`/api/groups/${id}/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchGroup();
    } catch { }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
      await fetch(`/api/groups/${id}/entries/${entryId}`, {
        method: 'DELETE',
      });
      fetchGroup();
    } catch { }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;
    try {
      const res = await fetch(`/api/groups/${id}/leave`, {
        method: 'POST',
      });
      const resData = await res.json();
      if (!res.ok) {
        alert(resData.error || 'Failed to leave group');
        return;
      }
      router.push('/lending');
    } catch {
      alert('An error occurred.');
    }
  };

  const copySummaryWhatsApp = () => {
    if (!data?.plan || data.plan.length === 0) {
      navigator.clipboard.writeText('BudgetMitra: All balances are settled!');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    const memberMap = new Map<string, string>();
    data.members?.forEach((m) => memberMap.set(m.userId, m.displayName));

    let text = `*BudgetMitra Settlement Plan (${data.group.name})*\n`;
    data.plan.forEach((item) => {
      const fromName = memberMap.get(item.from) || 'Someone';
      const toName = memberMap.get(item.to) || 'Someone';
      text += `• ${fromName} pays ${toName}: ${formatINR(item.paise)}\n`;
    });
    text += `\n_Generated via BudgetMitra (fewest payments)_`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="h-8 bg-gray-100 rounded w-1/3 animate-pulse" />
        <div className="h-36 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white border border-red-200 rounded-lg text-center">
        <AlertCircle size={32} className="mx-auto text-[#f4614d] mb-3" />
        <h2 className="text-lg font-bold text-[#0f2044] mb-1">Notice</h2>
        <p className="text-sm text-gray-600 mb-4">{error || 'Ledger not found'}</p>
        <Link
          href="/lending"
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-md transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to Lending</span>
        </Link>
      </div>
    );
  }

  const isDirect = data.group.type === 'direct';
  const otherMember = isDirect
    ? data.members?.find((m) => m.userId !== currentUserId)
    : null;

  const pageTitle = isDirect
    ? t('shared.directTitle', { name: otherMember?.displayName || 'Friend' })
    : t('shared.groupTitle', { name: data.group.name });

  const activeMembers = data.members?.filter((m) => m.status === 'active') || [];
  const memberMap = new Map<string, Member>();
  data.members?.forEach((m) => memberMap.set(m.userId, m));

  const myNet = data.nets?.[currentUserId || ''] ?? 0;
  const isGroupAdmin = data.myMembership.role === 'admin';

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <div>
        <Link
          href="/lending"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-teal-700 mb-2 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to Lending</span>
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#0f2044]">{pageTitle}</h1>

          {!isDirect && (
            <button
              onClick={handleLeaveGroup}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#f4614d] border border-gray-200 hover:border-red-200 px-2.5 py-1.5 rounded-md transition-colors"
              title={t('shared.leaveGroup')}
            >
              <LogOut size={14} />
              <span>{t('shared.leaveGroup')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              My Net Balance
            </span>
            <div className="mt-1">
              {myNet > 0 ? (
                <p className="text-xl font-bold text-teal-700 flex items-center gap-1">
                  <ArrowDownLeft size={20} />
                  <span>{t('lending.owesYou')} {formatINR(myNet)}</span>
                </p>
              ) : myNet < 0 ? (
                <p className="text-xl font-bold text-[#f4614d] flex items-center gap-1">
                  <ArrowUpRight size={20} />
                  <span>{t('lending.youOwe')} {formatINR(myNet)}</span>
                </p>
              ) : (
                <p className="text-xl font-bold text-gray-500">{t('shared.allSettled')}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isDirect && (
              <button
                onClick={() => setActiveModal('expense')}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3.5 py-2 rounded-md transition-colors"
              >
                <PlusCircle size={15} />
                <span>{t('shared.addExpense')}</span>
              </button>
            )}

            <button
              onClick={() => setActiveModal('receipt')}
              className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium px-3.5 py-2 rounded-md transition-colors"
            >
              <Receipt size={15} />
              <span>{t('shared.splitFromReceipt')}</span>
            </button>

            <button
              onClick={() => setActiveModal('loan')}
              className="flex items-center gap-1.5 bg-[#0f2044] hover:bg-blue-900 text-white text-xs font-medium px-3.5 py-2 rounded-md transition-colors"
            >
              <CreditCard size={15} />
              <span>{t('shared.recordLoan')}</span>
            </button>

            {!isDirect && isGroupAdmin && (
              <button
                onClick={() => setActiveModal('invite')}
                className="flex items-center gap-1.5 border border-gray-300 hover:border-gray-400 text-gray-700 text-xs font-medium px-3 py-2 rounded-md transition-colors"
              >
                <UserPlus size={15} />
                <span>{t('shared.inviteFriends')}</span>
              </button>
            )}
          </div>
        </div>

        {!isDirect && (
          <div className="pt-3">
            <span className="text-xs text-gray-500 font-medium">Members: </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {data.members?.map((m) => (
                <span
                  key={m.userId}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border ${m.status === 'invited'
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                      : 'bg-gray-50 border-gray-200 text-gray-700'
                    }`}
                >
                  <span className="font-medium">{m.displayName}</span>
                  {m.role === 'admin' && (
                    <span className="text-[10px] text-teal-800 font-bold uppercase">admin</span>
                  )}
                  {m.status === 'invited' && (
                    <span className="text-[10px] italic">(invited)</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {activeModal === 'expense' && (
        <ExpenseModal
          groupId={id}
          currentUserId={currentUserId || ''}
          activeMembers={activeMembers}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            fetchGroup();
          }}
        />
      )}

      {activeModal === 'receipt' && (
        <ReceiptSplitModal
          groupId={id}
          currentUserId={currentUserId || ''}
          activeMembers={activeMembers}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            fetchGroup();
          }}
        />
      )}

      {activeModal === 'loan' && (
        <LoanModal
          groupId={id}
          currentUserId={currentUserId || ''}
          isDirect={isDirect}
          activeMembers={activeMembers}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            fetchGroup();
          }}
        />
      )}

      {activeModal === 'invite' && (
        <InviteModal
          groupId={id}
          existingMemberIds={data.members?.map((m) => m.userId) || []}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            fetchGroup();
          }}
        />
      )}

      {/* Settle Up Plan Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#0f2044]">{t('shared.settlePlan')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('shared.settleNote')}</p>
          </div>
          <button
            onClick={copySummaryWhatsApp}
            className="flex items-center gap-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md transition-colors"
          >
            {copied ? <Check size={14} className="text-teal-700" /> : <Copy size={14} />}
            <span>{copied ? t('shared.copied') : t('shared.copySummary')}</span>
          </button>
        </div>

        {(!data.plan || data.plan.length === 0) ? (
          <p className="text-xs text-gray-500 italic py-2">{t('shared.allSettled')}</p>
        ) : (
          <div className="space-y-2.5">
            {data.plan.map((item, idx) => {
              const fromName = item.from === currentUserId ? 'You' : memberMap.get(item.from)?.displayName || 'Member';
              const toName = item.to === currentUserId ? 'You' : memberMap.get(item.to)?.displayName || 'Member';
              const isDebtor = item.from === currentUserId;

              return (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-md"
                >
                  <div className="text-xs font-medium text-[#0f2044]">
                    <span className="font-bold">{fromName}</span> pays{' '}
                    <span className="font-bold">{toName}</span>:{' '}
                    <span className="text-sm font-bold text-teal-800">{formatINR(item.paise)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isDebtor && (
                      <>
                        <button
                          onClick={() =>
                            setUpiModal({
                              mode: 'pay',
                              otherMemberId: item.to,
                              otherMemberName: toName,
                              suggestedPaise: item.paise,
                            })
                          }
                          className="flex items-center gap-1 bg-[#0f2044] hover:bg-blue-900 text-white text-xs font-semibold px-3 py-1 rounded-md transition-colors"
                        >
                          <QrCode size={13} className="text-teal-400" />
                          <span>{t('upi.payBtn')}</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={(item.paise / 100).toFixed(2)}
                            placeholder={(item.paise / 100).toFixed(2)}
                            value={paymentAmounts[item.to] ?? ''}
                            onChange={(e) =>
                              setPaymentAmounts({ ...paymentAmounts, [item.to]: e.target.value })
                            }
                            className="w-20 border border-gray-300 bg-white rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                          />
                          <button
                            onClick={() => handleRecordPayment(item.to, item.paise)}
                            disabled={payingTo === item.to}
                            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
                          >
                            {payingTo === item.to ? t('shared.paying') : t('shared.markPaid')}
                          </button>
                        </div>
                      </>
                    )}

                    {item.to === currentUserId && (
                      <button
                        onClick={() =>
                          setUpiModal({
                            mode: 'collect',
                            otherMemberId: item.from,
                            otherMemberName: fromName,
                            suggestedPaise: item.paise,
                          })
                        }
                        className="flex items-center gap-1 bg-white hover:bg-gray-100 text-[#0f2044] border border-gray-300 text-xs font-semibold px-3 py-1 rounded-md transition-colors"
                      >
                        <QrCode size={13} className="text-teal-700" />
                        <span>{t('upi.collectBtn')}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payments Awaiting Confirmation */}
      {data.pendingPayments && data.pendingPayments.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
            {t('shared.pendingPayments')}
          </h3>
          <div className="space-y-2">
            {data.pendingPayments.map((p) => {
              const isPayee = p.borrowerId === currentUserId;
              const isPayer = p.lenderId === currentUserId;
              const payerName = p.lenderName || 'Payer';
              const payeeName = p.borrowerName || 'Payee';

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-white border border-amber-200 rounded-md p-3"
                >
                  <div className="text-xs">
                    <p className="font-semibold text-[#0f2044]">
                      {payerName} recorded payment of {formatINR(p.paise)} to {payeeName}
                    </p>
                    {p.upiRef && (
                      <p className="font-mono text-[11px] font-semibold text-blue-900 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded inline-block mt-1">
                        UPI Ref: {p.upiRef}
                      </p>
                    )}
                    {isPayer && (
                      <p className="text-gray-500 italic mt-0.5">
                        {t('shared.pendingApprovalNotice', { name: payeeName })}
                      </p>
                    )}
                  </div>

                  {isPayee && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handlePaymentAction(p.id, 'confirm')}
                        className="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
                      >
                        <Check size={13} />
                        <span>{t('shared.confirm')}</span>
                      </button>
                      <button
                        onClick={() => handlePaymentAction(p.id, 'reject')}
                        className="flex items-center gap-1 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-[#f4614d] border border-gray-200 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
                      >
                        <X size={13} />
                        <span>{t('shared.reject')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity History */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-[#0f2044]">{t('shared.history')}</h3>

        {(!data.entries || data.entries.length === 0) ? (
          <p className="text-xs text-gray-400 py-3">{t('shared.noActivity')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.entries.map((entry) => {
              const isPayment = entry.kind === 'payment';
              const canDelete = entry.createdBy === currentUserId || isGroupAdmin;
              const dateStr = new Date(entry.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              });

              return (
                <li key={entry.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isPayment
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-emerald-100 text-emerald-900'
                          }`}
                      >
                        {isPayment ? 'Payment' : 'Expense / Loan'}
                      </span>
                      <span className="text-xs font-medium text-[#0f2044]">
                        {entry.lenderName} → {entry.borrowerName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      {entry.note && (
                        <span className="text-xs text-gray-600 font-medium">{entry.note}</span>
                      )}
                      <span className="text-[11px] text-gray-400">{dateStr}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#0f2044]">
                      {formatINR(entry.paise)}
                    </span>
                    {canDelete && (
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-gray-400 hover:text-[#f4614d] p-1 transition-colors"
                        title={t('shared.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* UPI Pay / Collect Modal */}
      {upiModal && (
        <UpiPaySheet
          mode={upiModal.mode}
          groupId={id}
          otherMemberId={upiModal.otherMemberId}
          otherMemberName={upiModal.otherMemberName}
          suggestedPaise={upiModal.suggestedPaise}
          onClose={() => setUpiModal(null)}
          onSuccess={() => {
            setUpiModal(null);
            fetchGroup();
          }}
        />
      )}
    </div>
  );
}
