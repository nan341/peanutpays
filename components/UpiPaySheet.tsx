'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { X, ExternalLink, QrCode, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

interface UpiPaySheetProps {
  mode: 'pay' | 'collect';
  groupId: string;
  otherMemberId: string;
  otherMemberName: string;
  suggestedPaise: number;
  onClose: () => void;
  onSuccess: () => void;
}

interface PayLinkData {
  uri: string;
  payeeName: string;
  vpa: string;
  amountPaise: number;
  vpaChangedRecently: boolean;
}

interface CollectLinkData {
  uri: string;
  amountPaise: number;
  payerName: string;
}

export default function UpiPaySheet({
  mode,
  groupId,
  otherMemberId,
  otherMemberName,
  suggestedPaise,
  onClose,
  onSuccess,
}: UpiPaySheetProps) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payeeNoUpi, setPayeeNoUpi] = useState(false);
  const [youNoUpi, setYouNoUpi] = useState(false);

  const [payData, setPayData] = useState<PayLinkData | null>(null);
  const [collectData, setCollectData] = useState<CollectLinkData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Form for "I have paid"
  const [paidAmount, setPaidAmount] = useState<string>((suggestedPaise / 100).toFixed(2));
  const [upiRef, setUpiRef] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const formattedAmount = `₹${(suggestedPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  useEffect(() => {
    let active = true;

    async function generateLinks() {
      setLoading(true);
      setError(null);
      setPayeeNoUpi(false);
      setYouNoUpi(false);

      try {
        if (mode === 'pay') {
          const res = await fetch(`/api/groups/${groupId}/pay-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payeeId: otherMemberId,
              paise: suggestedPaise,
            }),
          });

          const data = await res.json();
          if (!active) return;

          if (!res.ok) {
            if (res.status === 409 && data.code === 'PAYEE_NO_UPI') {
              setPayeeNoUpi(true);
            } else {
              setError(data.error || t('upi.payLinkFailed'));
            }
            setLoading(false);
            return;
          }

          setPayData(data);

          // Generate QR code on client side
          const QRCode = (await import('qrcode')).default;
          const url = await QRCode.toDataURL(data.uri, {
            width: 220,
            margin: 1,
            color: {
              dark: '#0f2044',
              light: '#ffffff',
            },
          });
          if (active) setQrDataUrl(url);
        } else {
          // Collect mode
          const res = await fetch(`/api/groups/${groupId}/collect-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payerId: otherMemberId,
              paise: suggestedPaise,
            }),
          });

          const data = await res.json();
          if (!active) return;

          if (!res.ok) {
            if (res.status === 409 && data.code === 'YOU_HAVE_NO_UPI') {
              setYouNoUpi(true);
            } else {
              setError(data.error || t('upi.collectLinkFailed'));
            }
            setLoading(false);
            return;
          }

          setCollectData(data);

          // Generate QR code
          const QRCode = (await import('qrcode')).default;
          const url = await QRCode.toDataURL(data.uri, {
            width: 220,
            margin: 1,
            color: {
              dark: '#0f2044',
              light: '#ffffff',
            },
          });
          if (active) setQrDataUrl(url);
        }
      } catch (err) {
        console.error('[UpiPaySheet] Error loading link:', err);
        if (active) setError(t('upi.networkError'));
      } finally {
        if (active) setLoading(false);
      }
    }

    generateLinks();

    return () => {
      active = false;
    };
  }, [mode, groupId, otherMemberId, suggestedPaise, t]);

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amt = parseFloat(paidAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError(t('upi.invalidAmount'));
      return;
    }

    const maxAllowed = suggestedPaise / 100;
    if (amt > maxAllowed + 0.001) {
      setFormError(t('upi.amountExceedsLimit'));
      return;
    }

    const trimmedRef = upiRef.trim();
    if (trimmedRef.length > 0 && !/^\d{12}$/.test(trimmedRef)) {
      setFormError(t('upi.refDigitsError'));
      return;
    }

    setSubmittingPayment(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment',
          payeeId: otherMemberId,
          amountRupees: amt,
          upiRef: trimmedRef || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || t('upi.recordPaymentFailed'));
        return;
      }

      setPaymentSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch {
      setFormError(t('upi.networkError'));
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-gray-200 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-[#0f2044] text-white rounded-t-lg">
          <div className="flex items-center gap-2">
            <QrCode size={18} className="text-teal-400" />
            <h3 className="text-sm font-semibold">
              {mode === 'pay' ? t('upi.payTitle') : t('upi.collectTitle')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="py-12 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-gray-500 font-medium">{t('upi.generating')}</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-center space-y-2">
              <ShieldAlert size={24} className="text-[#f4614d] mx-auto" />
              <p className="text-xs font-semibold text-red-800">{error}</p>
              <button
                onClick={onClose}
                className="text-xs font-medium text-gray-600 underline hover:text-gray-900"
              >
                {t('shared.cancel')}
              </button>
            </div>
          )}

          {youNoUpi && !loading && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-center space-y-3">
              <AlertTriangle size={24} className="text-amber-600 mx-auto" />
              <h4 className="text-xs font-bold text-amber-900">{t('upi.youNoUpiTitle')}</h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                {t('upi.youNoUpiDesc')}
              </p>
              <a
                href="/profile"
                className="inline-block text-xs font-semibold bg-[#0f2044] hover:bg-blue-900 text-white px-4 py-2 rounded-md transition-colors"
              >
                {t('upi.goToProfile')}
              </a>
            </div>
          )}

          {/* Pay Mode Content */}
          {mode === 'pay' && !loading && !error && (
            <div className="space-y-4">
              {payeeNoUpi ? (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-md space-y-2">
                  <p className="text-xs text-gray-700">
                    {t('upi.payeeNoUpiDesc', { name: otherMemberName })}
                  </p>
                </div>
              ) : (
                payData && (
                  <div className="space-y-3">
                    {/* Payee Details Card */}
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-md space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500">{t('upi.payeeLabel')}</span>
                        <span className="text-xs font-bold text-[#0f2044]">
                          {payData.payeeName}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500">{t('upi.vpaLabel')}</span>
                        <span className="text-xs font-mono font-bold text-teal-800 break-all">
                          {payData.vpa}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline pt-1 border-t border-gray-200">
                        <span className="text-xs text-gray-500 font-medium">
                          {t('upi.amountLabel')}
                        </span>
                        <span className="text-base font-extrabold text-[#0f2044]">
                          {formattedAmount}
                        </span>
                      </div>
                    </div>

                    {/* Security Warnings */}
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-md text-[11px] text-blue-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <AlertTriangle size={13} className="text-blue-700 shrink-0" />
                        <span>{t('upi.verifyWarning')}</span>
                      </p>
                      {payData.vpaChangedRecently && (
                        <p className="text-amber-800 font-medium pt-1 border-t border-blue-200">
                          {t('upi.recentVpaChange', { name: payData.payeeName })}
                        </p>
                      )}
                    </div>

                    {/* Action Area: Mobile button & Desktop QR */}
                    <div className="flex flex-col items-center gap-3 pt-2">
                      <a
                        href={payData.uri}
                        className="w-full text-center py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-md shadow-sm transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink size={14} />
                        <span>{t('upi.openApp')}</span>
                      </a>

                      {qrDataUrl && (
                        <div className="flex flex-col items-center py-2">
                          <div className="p-2 bg-white border border-gray-300 rounded-md shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={qrDataUrl}
                              alt="UPI QR Code"
                              className="w-[200px] h-[200px] object-contain"
                            />
                          </div>
                          <span className="text-[11px] text-gray-500 mt-1.5 font-medium">
                            {t('upi.scanCaption')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {/* "I Have Paid" Form */}
              <div className="border-t border-gray-200 pt-4 mt-2">
                {paymentSuccess ? (
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-md text-center space-y-1">
                    <CheckCircle2 size={20} className="text-teal-700 mx-auto" />
                    <p className="text-xs font-bold text-teal-900">
                      {t('upi.paymentRecorded')}
                    </p>
                    <p className="text-[11px] text-teal-800">
                      {t('shared.pendingApprovalNotice', { name: otherMemberName })}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleRecordPaymentSubmit} className="space-y-3">
                    <h4 className="text-xs font-bold text-[#0f2044]">
                      {t('upi.iHavePaidTitle')}
                    </h4>

                    {formError && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                        {formError}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          {t('upi.amountPaidRupees')}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={(suggestedPaise / 100).toFixed(2)}
                          value={paidAmount}
                          onChange={(e) => setPaidAmount(e.target.value)}
                          required
                          className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          {t('upi.refNumber')}
                        </label>
                        <input
                          type="text"
                          maxLength={12}
                          pattern="[0-9]{12}"
                          placeholder="12-digit ref"
                          value={upiRef}
                          onChange={(e) => setUpiRef(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500">
                      {t('upi.refHint')}
                    </p>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        {t('shared.cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={submittingPayment}
                        className="px-4 py-1.5 bg-[#0f2044] hover:bg-blue-900 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors"
                      >
                        {submittingPayment ? t('shared.saving') : t('upi.submitPaid')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* Collect Mode Content */}
          {mode === 'collect' && !loading && !error && collectData && (
            <div className="space-y-4 text-center">
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-xs text-gray-500">{t('upi.collectAmount')}</p>
                <p className="text-lg font-extrabold text-[#0f2044] mt-0.5">
                  {formattedAmount}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {t('upi.fromPayer', { name: collectData.payerName })}
                </p>
              </div>

              {qrDataUrl && (
                <div className="flex flex-col items-center py-2">
                  <div className="p-2.5 bg-white border border-gray-300 rounded-md shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt="UPI Collect QR Code"
                      className="w-[220px] h-[220px] object-contain"
                    />
                  </div>
                  <p className="text-xs font-semibold text-[#0f2044] mt-2">
                    {t('upi.askScanCaption', { name: collectData.payerName })}
                  </p>
                  <p className="text-[11px] text-gray-500 max-w-xs mt-1">
                    {t('upi.confirmReceiptNote')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
