'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Receipt, Plus, Trash2, AlertTriangle, CheckCircle, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import type { Worker } from 'tesseract.js';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  parseReceipt,
  compareToReceipt,
  extraChargesPaise,
  ReceiptParseResult,
} from '@/lib/receiptParser';
import { calculateReceiptSplit, SplitItem } from '@/lib/receiptSplit';

interface Member {
  userId: string;
  displayName: string;
}

interface ReceiptSplitModalProps {
  groupId: string;
  currentUserId: string;
  activeMembers: Member[];
  isDirect?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EditableItem {
  id: string;
  name: string;
  priceRupees: string;
  repaired?: boolean;
  unverified?: boolean;
  assignedMemberIds: string[];
}

function formatINR(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  return `₹${rupees.toLocaleString('en-IN', {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Modal steps
  const [step, setStep] = useState<'upload' | 'ocr' | 'review'>('upload');
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);

  // Review states
  const [items, setItems] = useState<EditableItem[]>([]);
  const [parseResult, setParseResult] = useState<ReceiptParseResult | null>(null);
  const [failureType, setFailureType] = useState<'none' | 'engine-error' | 'unclear'>('none');
  const [rawOcrText, setRawOcrText] = useState<string>('');
  const [showRawText, setShowRawText] = useState(false);

  const [paidBy, setPaidBy] = useState<string>(currentUserId);
  const [description, setDescription] = useState('Receipt');
  const [includeItemNamesInNote, setIncludeItemNamesInNote] = useState(false);
  const [includeTax, setIncludeTax] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleCancelOcr = async () => {
    if (workerRef.current) {
      try {
        await workerRef.current.terminate();
      } catch {}
      workerRef.current = null;
    }
    setStep('upload');
    setProgress(0);
  };

  /**
   * Run OCR using local self-hosted worker on given image blob/file.
   */
  const performOcr = async (imageInput: Blob | File): Promise<string> => {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core',
      langPath: '/tesseract/lang',
      workerBlobURL: false,
      cacheMethod: 'none',
      logger: (m) => {
        if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
          setProgress(Math.round(m.progress * 100));
        }
      },
    });

    workerRef.current = worker;

    await worker.setParameters({
      tessedit_pageseg_mode: '6' as unknown as import('tesseract.js').PSM,
      preserve_interword_spaces: '1',
    });

    const result = await worker.recognize(imageInput);
    const text = result.data?.text || '';

    await worker.terminate();
    workerRef.current = null;

    return text;
  };

  const processImageFile = async (file: File) => {
    setFileError(null);
    setFailureType('none');
    setRawOcrText('');

    // Validate type and size (max 10MB)
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setFileError(t('receipt.invalidFormat'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError(t('receipt.fileTooLarge'));
      return;
    }

    setStep('ocr');
    setProgress(0);

    let objectUrl: string | null = null;
    try {
      // 1. Create canvas preprocessed image (mild contrast, no hard threshold / binarisation)
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = objectUrl!;
      });

      const maxSide = 2000;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxSide || h > maxSide) {
        if (w > h) {
          h = Math.round((h * maxSide) / w);
          w = maxSide;
        } else {
          w = Math.round((w * maxSide) / h);
          h = maxSide;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      // Mild grayscale and moderate contrast boost (no binarisation)
      const contrastFactor = 1.25;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const contrasted = (gray - 128) * contrastFactor + 128;
        const clamped = Math.max(0, Math.min(255, contrasted));
        d[i] = clamped;
        d[i + 1] = clamped;
        d[i + 2] = clamped;
      }
      ctx.putImageData(imgData, 0, 0);

      const preprocessedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');
      });

      // 2. Perform OCR on preprocessed image
      let rawText = await performOcr(preprocessedBlob);
      let parsed = parseReceipt(rawText);

      // If processed image gives 0 parsed items, retry ONCE on original unprocessed file
      if (parsed.items.length === 0) {
        setProgress(0);
        try {
          const rawOriginalText = await performOcr(file);
          const parsedOriginal = parseReceipt(rawOriginalText);
          if (parsedOriginal.items.length > 0) {
            rawText = rawOriginalText;
            parsed = parsedOriginal;
          }
        } catch {
          // If retry throws, retain the original processed result / error
        }
      }

      setRawOcrText(rawText);
      setParseResult(parsed);

      if (parsed.items.length === 0) {
        setFailureType('unclear');
        populateEmptyReviewItems();
      } else {
        setFailureType('none');
        populateReviewItems(parsed);
      }

      setStep('review');
    } catch {
      // Clean up worker on engine error
      if (workerRef.current) {
        try {
          await workerRef.current.terminate();
        } catch {}
        workerRef.current = null;
      }
      setFailureType('engine-error');
      setParseResult(null);
      populateEmptyReviewItems();
      setStep('review');
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const populateEmptyReviewItems = () => {
    setItems([
      {
        id: `item-${Date.now()}-0`,
        name: '',
        priceRupees: '',
        assignedMemberIds: [],
      },
    ]);
  };

  const populateReviewItems = (parsed: ReceiptParseResult) => {
    if (parsed.items.length > 0) {
      setItems(
        parsed.items.map((it, idx) => ({
          id: `item-${Date.now()}-${idx}`,
          name: it.name,
          priceRupees: (it.pricePaise / 100).toFixed(2),
          repaired: it.repaired,
          unverified: it.unverified,
          assignedMemberIds: [],
        }))
      );
    } else {
      populateEmptyReviewItems();
    }
  };

  // Item modifications
  const handleItemChange = (id: string, field: 'name' | 'priceRupees', value: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length}`,
        name: '',
        priceRupees: '',
        assignedMemberIds: [],
      },
    ]);
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleToggleMember = (itemId: string, memberId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const exists = it.assignedMemberIds.includes(memberId);
        const newAssigned = exists
          ? it.assignedMemberIds.filter((m) => m !== memberId)
          : [...it.assignedMemberIds, memberId];
        return { ...it, assignedMemberIds: newAssigned };
      })
    );
  };

  const handleToggleEveryone = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const allAssigned = activeMembers.every((m) => it.assignedMemberIds.includes(m.userId));
        return {
          ...it,
          assignedMemberIds: allAssigned ? [] : activeMembers.map((m) => m.userId),
        };
      })
    );
  };

  const handleAssignAllUnassigned = () => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.assignedMemberIds.length === 0) {
          return {
            ...it,
            assignedMemberIds: activeMembers.map((m) => m.userId),
          };
        }
        return it;
      })
    );
  };

  // Convert valid items for split calculation
  const validSplitItems: SplitItem[] = items.map((it) => {
    const p = parseFloat(it.priceRupees) || 0;
    return {
      name: it.name.trim() || 'Item',
      pricePaise: Math.round(p * 100),
      assignedMemberIds: it.assignedMemberIds,
    };
  });

  const allMemberIds = activeMembers.map((m) => m.userId);
  const itemsTotalPaise = validSplitItems.reduce((acc, it) => acc + it.pricePaise, 0);

  // Extra charges calculation
  const extraCharges = parseResult
    ? extraChargesPaise(parseResult, itemsTotalPaise)
    : 0;

  const splitResult = calculateReceiptSplit(
    validSplitItems,
    allMemberIds,
    includeTax,
    extraCharges
  );

  // Comparison evaluation
  const comparison = parseResult
    ? compareToReceipt(itemsTotalPaise, parseResult)
    : { status: 'unknown' as const };

  const handleConfirmSubmit = async () => {
    if (splitResult.unassignedCount > 0 || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const splits: { borrowerId: string; paise: number; note?: string }[] = [];

      for (const m of activeMembers) {
        if (m.userId === paidBy) continue;
        const paiseOwed = splitResult.memberTotals[m.userId] || 0;
        if (paiseOwed > 0) {
          let note = description.trim() || 'Receipt';
          if (includeItemNamesInNote) {
            const memberItemNames = items
              .filter((it) => it.assignedMemberIds.includes(m.userId) && it.name.trim().length > 0)
              .map((it) => it.name.trim());
            if (memberItemNames.length > 0) {
              note = `${note} (${memberItemNames.join(', ')})`;
            }
          }
          splits.push({
            borrowerId: m.userId,
            paise: paiseOwed,
            note: note.slice(0, 100),
          });
        }
      }

      if (splits.length === 0) {
        setSubmitError('No debts created (all items assigned to payer).');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/groups/${groupId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'itemized_split',
          payerId: paidBy,
          totalPaise: splitResult.grandTotalPaise,
          splits,
          description: description.trim() || 'Receipt',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setSubmitError(resData.error || 'Failed to save receipt split');
        setSubmitting(false);
        return;
      }

      onSuccess();
    } catch {
      setSubmitError('An error occurred while saving.');
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border-2 border-teal-600 rounded-lg p-5 shadow-md">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-teal-700" />
          <h3 className="font-bold text-[#0f2044] text-sm">{t('receipt.modalTitle')}</h3>
        </div>
        <button
          onClick={onClose}
          disabled={submitting}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-teal-600 rounded-lg p-8 text-center cursor-pointer transition-colors bg-gray-50 hover:bg-teal-50/30"
          >
            <Upload size={32} className="mx-auto text-teal-600 mb-2" />
            <p className="text-sm font-semibold text-[#0f2044] mb-1">
              {t('receipt.uploadPrompt')}
            </p>
            <p className="text-xs text-gray-500">{t('receipt.uploadHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processImageFile(file);
              }}
            />
          </div>

          {fileError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-[#f4614d] flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>{fileError}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => {
                setFailureType('none');
                setParseResult(null);
                populateEmptyReviewItems();
                setStep('review');
              }}
              className="text-xs text-teal-700 hover:underline font-medium"
            >
              {t('receipt.manualAddPrompt')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('shared.cancel')}
            </button>
          </div>
        </div>
      )}

      {step === 'ocr' && (
        <div className="space-y-5 py-6 text-center">
          <div>
            <p className="text-sm font-semibold text-[#0f2044] mb-1">
              {t('receipt.readingReceipt')}
            </p>
            <p className="text-xs text-gray-500">{progress}%</p>
          </div>

          {/* Determinate progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-teal-600 h-2.5 transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>

          <button
            type="button"
            onClick={handleCancelOcr}
            className="px-4 py-1.5 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t('shared.cancel')}
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          {/* Failure states & notice separation */}
          {failureType === 'engine-error' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-700" />
              <span>{t('receipt.engineUnavailable')}</span>
            </div>
          )}

          {failureType === 'unclear' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-700" />
              <span>{t('receipt.unclearReceipt')}</span>
            </div>
          )}

          {failureType === 'none' && parseResult && !parseResult.tableFound && (
            <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-900">
              {t('receipt.tableNotFoundNotice')}
            </div>
          )}

          {/* Top metadata: Description & Payer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 border border-gray-200 p-3 rounded-md">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('receipt.descriptionLabel')}
              </label>
              <input
                type="text"
                maxLength={50}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('shared.payer')}
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-teal-600 focus:outline-none"
              >
                {activeMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName} {m.userId === currentUserId ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Unassigned quick action link */}
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-gray-700">
              {t('receipt.itemsHeading')} ({items.length})
            </span>
            <button
              type="button"
              onClick={handleAssignAllUnassigned}
              className="text-teal-700 hover:underline font-medium"
            >
              {t('receipt.assignAllEveryone')}
            </button>
          </div>

          {/* Editable items list */}
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {items.map((item) => {
              const allAssigned = activeMembers.every((m) => item.assignedMemberIds.includes(m.userId));
              return (
                <div
                  key={item.id}
                  className="p-3 bg-white border border-gray-200 rounded-md space-y-2 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-teal-600 focus:outline-none"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 font-semibold">₹</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        value={item.priceRupees}
                        onChange={(e) => handleItemChange(item.id, 'priceRupees', e.target.value)}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-teal-600 focus:outline-none"
                      />
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-gray-400 hover:text-[#f4614d] p-1 transition-colors"
                        title="Delete item"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {(item.repaired || item.unverified) && (
                    <p className="text-[11px] text-[#f4614d] font-medium flex items-center gap-1">
                      <AlertTriangle size={12} />
                      <span>{t('receipt.checkPriceHint')}</span>
                    </p>
                  )}

                  {/* Member assignment checkboxes */}
                  <div className="pt-1 border-t border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-700">
                    <button
                      type="button"
                      onClick={() => handleToggleEveryone(item.id)}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                        allAssigned
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {t('receipt.everyone')}
                    </button>

                    {activeMembers.map((m) => {
                      const isAssigned = item.assignedMemberIds.includes(m.userId);
                      return (
                        <label
                          key={m.userId}
                          className="flex items-center gap-1.5 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => handleToggleMember(item.id, m.userId)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 text-xs"
                          />
                          <span>
                            {m.displayName} {m.userId === currentUserId ? '(You)' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            <Plus size={14} />
            <span>{t('receipt.addItem')}</span>
          </button>

          {/* Running Totals & Comparison Messages */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3.5 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-[#0f2044]">
              <span>{t('receipt.itemsTotal')}:</span>
              <span className="text-sm text-teal-800">{formatINR(splitResult.itemsTotalPaise)}</span>
            </div>

            {/* Comparison states */}
            {comparison.status === 'match' && (
              <div className="p-2 bg-teal-50 border border-teal-200 rounded text-[11px] text-teal-900 flex items-center gap-1.5">
                <CheckCircle size={13} className="shrink-0 text-teal-700" />
                <span>
                  {comparison.kind === 'sub-total'
                    ? t('receipt.matchesSubtotal', { amount: formatINR(comparison.amountPaise) })
                    : t('receipt.matchesTotal', { amount: formatINR(comparison.amountPaise) })}
                </span>
              </div>
            )}

            {comparison.status === 'mismatch' && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-700" />
                <span>
                  {t('receipt.mismatch', {
                    itemsTotal: formatINR(comparison.itemsTotalPaise),
                    receiptTotal: formatINR(comparison.receiptTotalPaise),
                    kind: comparison.kind === 'sub-total' ? t('receipt.subtotal') : t('receipt.total'),
                  })}
                </span>
              </div>
            )}

            {comparison.status === 'extra' && (
              <div className="p-2 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-900 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5 text-blue-700" />
                <span>
                  {t('receipt.extraChargesNotice', {
                    receiptTotal: formatINR(comparison.receiptTotalPaise),
                    extra: formatINR(comparison.extraPaise),
                  })}
                </span>
              </div>
            )}

            <p className="text-[11px] text-gray-500 italic">
              {t('receipt.taxNotIncluded')}
            </p>

            {/* Optional Tax & Charges Checkbox */}
            {extraCharges > 0 && (
              <div className="pt-2 border-t border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-800 font-medium">
                  <input
                    type="checkbox"
                    checked={includeTax}
                    onChange={(e) => setIncludeTax(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    {t('receipt.addTaxOption', { amount: formatINR(extraCharges) })}
                  </span>
                </label>
                {includeTax && (
                  <div className="mt-1 flex justify-between items-center text-xs font-bold text-[#0f2044]">
                    <span>{t('receipt.grandTotal')}:</span>
                    <span className="text-sm text-teal-800">{formatINR(splitResult.grandTotalPaise)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Note checkbox */}
            <div className="pt-2 border-t border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={includeItemNamesInNote}
                  onChange={(e) => setIncludeItemNamesInNote(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span>{t('receipt.includeItemNamesInNote')}</span>
              </label>
            </div>
          </div>

          {/* Member breakdown preview */}
          <div className="bg-white border border-gray-200 rounded-md p-3">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              {t('receipt.splitSummary')}
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {activeMembers.map((m) => (
                <div key={m.userId} className="flex justify-between items-center text-gray-700">
                  <span>{m.displayName}:</span>
                  <span className="font-semibold text-[#0f2044]">
                    {formatINR(splitResult.memberTotals[m.userId] || 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {splitResult.unassignedCount > 0 && (
            <p className="text-xs text-[#f4614d] font-semibold">
              {t('receipt.unassignedWarning', { count: splitResult.unassignedCount })}
            </p>
          )}

          {/* DEV-ONLY collapsible raw OCR text panel (stripped in production) */}
          {process.env.NODE_ENV !== 'production' && rawOcrText.length > 0 && (
            <div className="border border-gray-200 rounded-md p-2 bg-gray-50 text-xs">
              <button
                type="button"
                onClick={() => setShowRawText(!showRawText)}
                className="flex items-center justify-between w-full text-gray-600 hover:text-gray-900 font-medium"
              >
                <span>{showRawText ? t('receipt.hideRawOcr') : t('receipt.showRawOcr')}</span>
                {showRawText ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showRawText && (
                <pre className="mt-2 p-2 bg-white border border-gray-200 rounded text-[10px] text-gray-700 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {rawOcrText}
                </pre>
              )}
            </div>
          )}

          {submitError && <p className="text-xs text-[#f4614d]">{submitError}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={splitResult.unassignedCount > 0 || submitting || splitResult.itemsTotalPaise <= 0}
              className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold py-2 rounded-md text-xs transition-colors"
            >
              {submitting ? t('shared.saving') : t('shared.confirm')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('shared.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
