'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Receipt,
  Users,
  Check,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { parseReceiptDetails } from '@/lib/ocr-parser';
import { splitEqually } from '@/lib/settle';
import { createWorker } from 'tesseract.js';

interface Member {
  userId: string;
  displayName: string;
}

interface ItemRow {
  id: string;
  name: string;
  price: string; // string for input editing
  assignedMembers: string[];
}

interface ReceiptSplitModalProps {
  groupId: string;
  currentUserId: string;
  activeMembers: Member[];
  onClose: () => void;
  onSuccess: () => void;
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ReceiptSplitModal({
  groupId,
  currentUserId,
  activeMembers,
  onClose,
  onSuccess,
}: ReceiptSplitModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [note, setNote] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [ocrWarning, setOcrWarning] = useState<string | null>(null);
  const [detectedSubtotal, setDetectedSubtotal] = useState<number | null>(null);
  const [detectedTotal, setDetectedTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFileName(file.name);
    setIsScanning(true);
    setOcrProgress(0);
    setOcrWarning(null);
    setError(null);
    setDetectedSubtotal(null);
    setDetectedTotal(null);
    setOcrStatusText(t('shared.receiptInitializing') || 'Initializing on-device OCR...');

    let worker = null;
    try {
      worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrStatusText(t('shared.receiptScanning') || 'Scanning receipt...');
            setOcrProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      const { data } = await worker.recognize(file);
      const parseResult = parseReceiptDetails(data.text);
      const extracted = parseResult.items;

      setDetectedSubtotal(parseResult.detectedSubtotal ?? null);
      setDetectedTotal(parseResult.detectedTotal ?? null);

      if (extracted.length === 0) {
        setOcrWarning(
          t('shared.receiptErrorFallback') ||
            "Couldn't read this receipt clearly — you can add items manually below."
        );
        setItems([
          {
            id: Math.random().toString(36).substring(2, 9),
            name: '',
            price: '',
            assignedMembers: activeMembers.map((m) => m.userId),
          },
        ]);
      } else {
        const rows: ItemRow[] = extracted.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price.toString(),
          assignedMembers: activeMembers.map((m) => m.userId),
        }));
        setItems(rows);
      }
    } catch (err) {
      console.error('[Client OCR Error]', err);
      setOcrWarning(
        t('shared.receiptErrorFallback') ||
          "Couldn't read this receipt clearly — you can add items manually below."
      );
      if (items.length === 0) {
        setItems([
          {
            id: Math.random().toString(36).substring(2, 9),
            name: '',
            price: '',
            assignedMembers: activeMembers.map((m) => m.userId),
          },
        ]);
      }
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
      setIsScanning(false);
    }
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        name: '',
        price: '',
        assignedMembers: activeMembers.map((m) => m.userId),
      },
    ]);
  };

  const removeItemRow = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItemName = (id: string, name: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item))
    );
  };

  const updateItemPrice = (id: string, price: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, price } : item))
    );
  };

  const toggleItemMember = (itemId: string, memberId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const exists = item.assignedMembers.includes(memberId);
        const nextMembers = exists
          ? item.assignedMembers.filter((id) => id !== memberId)
          : [...item.assignedMembers, memberId];
        return { ...item, assignedMembers: nextMembers };
      })
    );
  };

  const selectAllMembersForItem = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, assignedMembers: activeMembers.map((m) => m.userId) }
          : item
      )
    );
  };

  // Calculate totals and per-person allocations in real-time
  let receiptTotal = 0;
  const memberTotalsPaise: Record<string, number> = {};
  for (const m of activeMembers) {
    memberTotalsPaise[m.userId] = 0;
  }

  let unassignedCount = 0;

  for (const item of items) {
    const p = parseFloat(item.price);
    if (!isNaN(p) && p > 0) {
      receiptTotal += p;
      if (item.assignedMembers.length === 0) {
        unassignedCount++;
      } else {
        const itemPaise = Math.round(p * 100);
        const split = splitEqually(itemPaise, item.assignedMembers);
        for (const [uid, paise] of Object.entries(split)) {
          if (memberTotalsPaise[uid] !== undefined) {
            memberTotalsPaise[uid] += paise;
          }
        }
      }
    } else if (item.assignedMembers.length === 0) {
      unassignedCount++;
    }
  }

  const allocatedTotal =
    Object.values(memberTotalsPaise).reduce((a, b) => a + b, 0) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setError(t('shared.noItemsError') || 'Please add at least one line item.');
      return;
    }

    if (unassignedCount > 0) {
      setError(
        t('shared.unassignedWarning') ||
          'Please assign all items to at least one person.'
      );
      return;
    }

    if (receiptTotal <= 0) {
      setError(
        t('shared.invalidTotalError') || 'Please enter valid prices for items.'
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const shares = Object.entries(memberTotalsPaise).map(([userId, paise]) => ({
        userId,
        amountRupees: paise / 100,
      }));

      const res = await fetch(`/api/groups/${groupId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom_split',
          shares,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to record receipt split');
        return;
      }

      onSuccess();
    } catch {
      setError('An unexpected error occurred while saving.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-2 border-teal-600 rounded-lg p-5 shadow-md space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-teal-50 text-teal-700 rounded-md">
            <Receipt size={18} />
          </div>
          <div>
            <h3 className="font-bold text-[#0f2044] text-sm">
              {t('shared.splitFromReceipt')}
            </h3>
            <p className="text-[11px] text-gray-500">
              {t('shared.ocrPrivacyNote') ||
                '100% on-device OCR — your receipt image never leaves your browser.'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Upload Zone (if no items or user wants to re-scan) */}
      <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white border border-gray-200 rounded-md text-teal-600 shrink-0">
            <UploadCloud size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#0f2044]">
              {imageFileName
                ? `Loaded: ${imageFileName}`
                : t('shared.uploadReceiptPrompt') || 'Upload receipt image (JPG / PNG)'}
            </p>
            <p className="text-[11px] text-gray-500">
              {t('shared.uploadReceiptSub') ||
                'Client-side text recognition will automatically extract line items and prices.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
          />
          <button
            type="button"
            disabled={isScanning}
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto text-xs font-semibold bg-white hover:bg-gray-100 text-[#0f2044] border border-gray-300 px-3 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isScanning
              ? t('shared.scanning') || 'Scanning...'
              : imageFileName
              ? t('shared.reuploadReceipt') || 'Scan Another'
              : t('shared.selectImage') || 'Select Image'}
          </button>
          {items.length === 0 && (
            <button
              type="button"
              onClick={addItemRow}
              className="w-full sm:w-auto text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md transition-colors"
            >
              {t('shared.addManually') || '+ Add Manually'}
            </button>
          )}
        </div>
      </div>

      {/* OCR Progress Loading State */}
      {isScanning && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-md space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-teal-900">
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-teal-700" />
              {ocrStatusText}
            </span>
            <span>{ocrProgress}%</span>
          </div>
          <div className="w-full bg-teal-200 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-teal-600 h-full transition-all duration-200"
              style={{ width: `${Math.max(5, ocrProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Warning Banner (e.g. Blurry or Fallback) */}
      {ocrWarning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2 text-xs text-amber-800">
          <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
          <span>{ocrWarning}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Optional Title/Note */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {t('shared.note')}
          </label>
          <input
            type="text"
            maxLength={100}
            placeholder={
              t('shared.receiptNotePlaceholder') ||
              'e.g. Dinner at Rajdhani, Grocery haul'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>

        {/* Editable Line Items Section */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-[#0f2044] uppercase tracking-wider">
              {t('shared.receiptItems') || 'Receipt Line Items'} ({items.length})
            </span>
            <button
              type="button"
              onClick={addItemRow}
              className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              <Plus size={14} />
              <span>{t('shared.addItem')}</span>
            </button>
          </div>

          {items.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-gray-200 rounded-md text-xs text-gray-500">
              {t('shared.noItemsPrompt') ||
                'Upload a receipt or click "+ Add Item" to enter items manually.'}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {items.map((item, index) => {
                const itemPriceNum = parseFloat(item.price) || 0;
                const assignedCount = item.assignedMembers.length;
                const perPersonShare =
                  assignedCount > 0 ? itemPriceNum / assignedCount : 0;

                return (
                  <div
                    key={item.id}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 w-4 shrink-0">
                        {index + 1}.
                      </span>
                      <input
                        type="text"
                        required
                        placeholder={t('shared.itemName') || 'Item description'}
                        value={item.name}
                        onChange={(e) => updateItemName(item.id, e.target.value)}
                        className="flex-1 border border-gray-300 rounded-md px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2.5 top-1.5 text-xs text-gray-500 font-medium">
                          ₹
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="1000000"
                          required
                          placeholder="0.00"
                          value={item.price}
                          onChange={(e) =>
                            updateItemPrice(item.id, e.target.value)
                          }
                          className="w-full pl-6 pr-2 py-1.5 text-xs font-semibold text-right border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItemRow(item.id)}
                        className="text-gray-400 hover:text-[#f4614d] p-1 shrink-0"
                        title={t('shared.delete')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Member Assignment Checkboxes */}
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200/60 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                          <Users size={12} /> {t('shared.splitAmong') || 'Split with'}:
                        </span>
                        {activeMembers.map((m) => {
                          const isChecked = item.assignedMembers.includes(m.userId);
                          return (
                            <label
                              key={m.userId}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-teal-50 border-teal-300 text-teal-900 font-medium'
                                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() =>
                                  toggleItemMember(item.id, m.userId)
                                }
                                className="sr-only"
                              />
                              {isChecked && <Check size={11} className="text-teal-700" />}
                              <span>
                                {m.displayName}{' '}
                                {m.userId === currentUserId ? '(You)' : ''}
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="text-[11px]">
                        {assignedCount === 0 ? (
                          <span className="text-[#f4614d] font-semibold">
                            ⚠️ {t('shared.noOneSelected') || 'Unassigned'}
                          </span>
                        ) : (
                          <span className="text-gray-600 font-medium">
                            {formatINR(perPersonShare)} / person ({assignedCount})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Receipt Total vs Extracted Items Sanity Check */}
        {detectedTotal !== null &&
          (Math.abs(receiptTotal - detectedTotal) > 0.5 ? (
            detectedSubtotal !== null && Math.abs(receiptTotal - detectedSubtotal) <= 0.5 ? (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-md text-xs text-teal-900 flex items-start gap-2">
                <Check size={16} className="shrink-0 text-teal-700 mt-0.5" />
                <span>
                  {t('shared.receiptSubtotalMatchNote', {
                    subtotal: formatINR(detectedSubtotal),
                    total: formatINR(detectedTotal),
                  })}
                </span>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 text-amber-700 mt-0.5" />
                <span>
                  {t('shared.receiptTotalMismatch', {
                    sum: formatINR(receiptTotal),
                    total: formatINR(detectedTotal),
                  })}
                </span>
              </div>
            )
          ) : null)}

        {/* Live Running Total & Per-Person Summary Card */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2.5">
          <div className="flex justify-between items-center text-xs pb-2 border-b border-gray-200">
            <div>
              <span className="text-gray-600 font-semibold">
                {t('shared.receiptTotal')}:
              </span>{' '}
              <span className="text-sm font-bold text-[#0f2044]">
                {formatINR(receiptTotal)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-gray-600 font-semibold">
                {t('shared.allocatedTotal')}:
              </span>{' '}
              <span
                className={`text-sm font-bold ${
                  Math.abs(receiptTotal - allocatedTotal) < 0.05
                    ? 'text-teal-800'
                    : 'text-[#f4614d]'
                }`}
              >
                {formatINR(allocatedTotal)}
              </span>
            </div>
          </div>

          {/* Per-member breakdown */}
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('shared.splitPreview')}:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              {activeMembers.map((m) => {
                const paise = memberTotalsPaise[m.userId] || 0;
                const isYou = m.userId === currentUserId;
                return (
                  <div
                    key={m.userId}
                    className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded-md"
                  >
                    <span className="text-gray-700 font-medium">
                      {m.displayName} {isYou ? '(Paid by You)' : ''}
                    </span>
                    <span
                      className={`font-bold ${
                        isYou ? 'text-gray-700' : 'text-teal-800'
                      }`}
                    >
                      {formatINR(paise / 100)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-[#f4614d] font-medium">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={
              loading ||
              isScanning ||
              items.length === 0 ||
              unassignedCount > 0 ||
              receiptTotal <= 0
            }
            className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 rounded-md text-sm transition-colors flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>{t('shared.saving')}</span>
              </>
            ) : (
              <span>{t('shared.confirmReceiptSplit') || 'Confirm & Split'}</span>
            )}
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
