export interface ParsedItem {
  name: string;
  pricePaise: number;
  repaired?: boolean;
  unverified?: boolean;
}

export type ParseNote = 'no-table-header' | 'no-end-line' | 'table-empty-fallback';

export interface ReceiptParseResult {
  items: ParsedItem[];
  subtotalPaise?: number;
  totalPaise?: number;
  taxPaise?: number;
  tableFound: boolean;
  notes: ParseNote[];
  rawText?: string;
}

export type ComparisonResult =
  | { status: 'match'; kind: 'sub-total' | 'total'; amountPaise: number }
  | { status: 'mismatch'; kind: 'sub-total' | 'total'; itemsTotalPaise: number; receiptTotalPaise: number }
  | { status: 'extra'; receiptTotalPaise: number; extraPaise: number }
  | { status: 'unknown' };

/**
 * Currency markers and symbols to normalize.
 */
const CURRENCY_REGEX = /(?:₹|Rs\.?|INR)\s*/gi;

/**
 * Reject keywords (case-insensitive) for non-item lines.
 */
const REJECT_KEYWORDS = [
  'invoice',
  'inv no',
  'inv. no',
  'bill no',
  'bill. no',
  'table',
  'date',
  'time',
  'gst no',
  'gstin',
  'phone',
  'mob',
  'tel',
  'cashier',
  'name:',
  'order',
  'mode',
  'thank',
  'visit',
];

/**
 * Header detection: line containing item word AND price/qty/total word.
 */
const ITEM_HEADER_WORDS = /\b(items?|ltems?|iems?|description|particulars)\b/i;
const ITEM_HEADER_COLS = /\b(price|rate|qty|quantity|amount|total)\b/i;

/**
 * Summary / End line triggers.
 */
const END_LINE_REGEX = /^(?:sub-total|subtotal|sub\s+total|grand\s+total|total|cgst|sgst|igst|gst(?!\s*(?:no|in|\:))|service\s+charge|round\s+off|net\s+amount|amount\s+payable)\b/i;
const SUMMARY_LOOKING_REGEX = /\b(?:sub-total|subtotal|sub\s+total|grand\s+total|cgst|sgst|igst|service\s+charge|round\s+off|net\s+amount|amount\s+payable)\b/i;

function isSummaryEndLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (
    lower.startsWith('gst no') ||
    lower.startsWith('gstin') ||
    lower.startsWith('invoice') ||
    lower.startsWith('inv no') ||
    lower.startsWith('table') ||
    lower.startsWith('date')
  ) {
    return false;
  }
  return END_LINE_REGEX.test(line) || SUMMARY_LOOKING_REGEX.test(line);
}

/**
 * Parse a raw number string (with optional thousands commas and decimals) to float.
 */
function parseNumberValue(str: string): number | null {
  const clean = str.replace(/,/g, '').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

/**
 * Parse rupee amount to integer paise.
 */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Extract all numeric tokens from a line (ignoring standalone percentage tokens like 2.5%).
 */
function extractNumericTokens(line: string): { text: string; value: number; index: number; length: number }[] {
  const tokens: { text: string; value: number; index: number; length: number }[] = [];
  const regex = /(?:\b|\s|^)(?:[₹]|\bRs\.?|\bINR)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(?!\s*%)(?:\b|\s|$)/gi;
  
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const rawMatch = match[1];
    const num = parseNumberValue(rawMatch);
    if (num !== null && !isNaN(num)) {
      tokens.push({
        text: rawMatch,
        value: num,
        index: match.index,
        length: match[0].length,
      });
    }
  }
  return tokens;
}

/**
 * Drop one leading character if it's a digit.
 */
function dropLeadingDigit(val: number): number | null {
  const str = Math.round(val).toString();
  if (str.length <= 1) return null;
  const sliced = str.slice(1);
  const parsed = parseInt(sliced, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Clean item name by stripping digits, currency, qty markers (x2, 2x, @), stray punctuation.
 */
function cleanItemName(rawName: string): string {
  let name = rawName.replace(CURRENCY_REGEX, ' ');
  name = name.replace(/(?:\b|\s)(?:x\d+|\d+x|@)(?:\b|\s)/gi, ' ');
  name = name.replace(/[0-9|_\~]/g, ' ');
  name = name.replace(/\.{2,}/g, ' ').replace(/\.+$/, '');
  name = name.replace(/\s+/g, ' ').trim();
  return name;
}

/**
 * Test if a line should be rejected based on non-item criteria.
 */
function shouldRejectLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  
  for (const kw of REJECT_KEYWORDS) {
    if (lower.includes(kw)) {
      return true;
    }
  }

  // Check 6-digit pincode anywhere on the line
  if (/\b\d{6}\b/.test(line)) {
    return true;
  }

  // Address-like lines: 2 or more commas
  const commaCount = (line.match(/,/g) || []).length;
  if (commaCount >= 2) {
    return true;
  }

  // Lines with no letters
  if (!/[a-zA-Z]/.test(line)) {
    return true;
  }

  return false;
}

/**
 * Pure receipt parsing function.
 */
export function parseReceipt(rawText: string): ReceiptParseResult {
  const notes: ParseNote[] = [];
  if (!rawText || typeof rawText !== 'string') {
    return { items: [], tableFound: false, notes: ['no-table-header'], rawText: '' };
  }

  const rawLines = rawText
    .split(/\r?\n|\//)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return { items: [], tableFound: false, notes: ['no-table-header'], rawText };
  }

  // Find START table header
  let startIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (ITEM_HEADER_WORDS.test(line) && ITEM_HEADER_COLS.test(line)) {
      startIdx = i;
      break;
    }
  }

  let tableFound = true;
  let itemStartLine = 0;
  if (startIdx !== -1) {
    itemStartLine = startIdx + 1;
  } else {
    tableFound = false;
    itemStartLine = 0;
    notes.push('no-table-header');
  }

  // Find END summary line
  let endIdx = rawLines.length;
  let endFound = false;
  for (let i = itemStartLine; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (isSummaryEndLine(line)) {
      endIdx = i;
      endFound = true;
      break;
    }
  }

  if (!endFound && tableFound) {
    notes.push('no-end-line');
  }

  const itemCandidates = rawLines.slice(itemStartLine, endIdx);
  const summaryLines = rawLines.slice(endIdx);

  const extractItemsFromLines = (lines: string[]): ParsedItem[] => {
    const items: ParsedItem[] = [];
    let pendingWrappedName: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (shouldRejectLine(line)) {
        pendingWrappedName = null;
        continue;
      }

      const tokens = extractNumericTokens(line);

      // Multiline wrapped name handling
      if (tokens.length === 0) {
        const candidateName = cleanItemName(line);
        const letterCount = (candidateName.match(/[a-zA-Z]/g) || []).length;
        if (letterCount >= 2) {
          pendingWrappedName = pendingWrappedName ? `${pendingWrappedName} ${candidateName}` : candidateName;
        }
        continue;
      }

      const lastToken = tokens[tokens.length - 1];
      const firstToken = tokens[0];

      const lineNamePart = line.substring(0, firstToken.index);
      let fullName = pendingWrappedName
        ? `${pendingWrappedName} ${lineNamePart}`
        : lineNamePart;
      
      fullName = cleanItemName(fullName);
      pendingWrappedName = null;

      const letters = (fullName.match(/[a-zA-Z]/g) || []).length;
      if (letters < 2) {
        continue;
      }

      let finalTotal = lastToken.value;
      let repaired = false;
      let unverified = false;

      if (tokens.length >= 3) {
        const val1 = tokens[0].value;
        const val2 = tokens[1].value;
        const val3 = tokens[tokens.length - 1].value;

        const matchesArithmetic = (p: number, q: number, tot: number) => {
          return Math.abs(p * q - tot) < 0.01;
        };

        if (matchesArithmetic(val1, val2, val3)) {
          finalTotal = val3;
          repaired = false;
        } else {
          const d1 = dropLeadingDigit(val1);
          const d3 = dropLeadingDigit(val3);

          if (d1 !== null && matchesArithmetic(d1, val2, val3)) {
            finalTotal = val3;
            repaired = true;
          } else if (d3 !== null && matchesArithmetic(val1, val2, d3)) {
            finalTotal = d3;
            repaired = true;
          } else if (d1 !== null && d3 !== null && matchesArithmetic(d1, val2, d3)) {
            finalTotal = d3;
            repaired = true;
          } else {
            unverified = true;
          }
        }
      } else if (tokens.length === 1) {
        unverified = true;
      }

      const pricePaise = toPaise(finalTotal);
      if (pricePaise > 0) {
        items.push({
          name: fullName,
          pricePaise,
          ...(repaired ? { repaired: true } : {}),
          ...(unverified ? { unverified: true } : {}),
        });
      }
    }

    return items;
  };

  let items = extractItemsFromLines(itemCandidates);

  if (items.length === 0 && tableFound) {
    notes.push('table-empty-fallback');
    items = extractItemsFromLines(rawLines);
  }

  // Summary lines totals extraction
  let subtotalPaise: number | undefined;
  let totalPaise: number | undefined;
  let taxSumPaise = 0;
  let hasTaxLine = false;

  for (const sLine of summaryLines) {
    const lower = sLine.toLowerCase();
    const tokens = extractNumericTokens(sLine);
    if (tokens.length === 0) continue;
    const lastNum = tokens[tokens.length - 1].value;
    const paiseVal = toPaise(lastNum);

    if (/\b(?:sub-total|subtotal|sub\s+total)\b/i.test(sLine)) {
      if (subtotalPaise === undefined) {
        subtotalPaise = paiseVal;
      }
    } else if (/\b(?:grand\s+total|total|amount\s+payable|net\s+amount)\b/i.test(sLine)) {
      if (totalPaise === undefined) {
        totalPaise = paiseVal;
      }
    } else if (/\b(?:cgst|sgst|igst|gst|service\s+charge)\b/i.test(lower)) {
      taxSumPaise += paiseVal;
      hasTaxLine = true;
    }
  }

  return {
    items,
    subtotalPaise,
    totalPaise,
    taxPaise: hasTaxLine ? taxSumPaise : undefined,
    tableFound,
    notes,
    rawText,
  };
}

/**
 * Compare items total against detected receipt totals.
 */
export function compareToReceipt(
  itemsTotalPaise: number,
  result: Pick<ReceiptParseResult, 'subtotalPaise' | 'totalPaise'>
): ComparisonResult {
  if (itemsTotalPaise <= 0) {
    return { status: 'unknown' };
  }

  if (result.subtotalPaise !== undefined) {
    if (itemsTotalPaise === result.subtotalPaise) {
      return { status: 'match', kind: 'sub-total', amountPaise: result.subtotalPaise };
    }
    if (itemsTotalPaise === result.totalPaise) {
      return { status: 'match', kind: 'total', amountPaise: result.totalPaise };
    }
    return {
      status: 'mismatch',
      kind: 'sub-total',
      itemsTotalPaise,
      receiptTotalPaise: result.subtotalPaise,
    };
  }

  if (result.totalPaise !== undefined) {
    if (itemsTotalPaise === result.totalPaise) {
      return { status: 'match', kind: 'total', amountPaise: result.totalPaise };
    }
    if (result.totalPaise > itemsTotalPaise) {
      return {
        status: 'extra',
        receiptTotalPaise: result.totalPaise,
        extraPaise: result.totalPaise - itemsTotalPaise,
      };
    }
    return {
      status: 'mismatch',
      kind: 'total',
      itemsTotalPaise,
      receiptTotalPaise: result.totalPaise,
    };
  }

  return { status: 'unknown' };
}

/**
 * Returns extra charges/tax amount in paise.
 */
export function extraChargesPaise(
  result: Pick<ReceiptParseResult, 'taxPaise' | 'totalPaise' | 'subtotalPaise'>,
  itemsTotalPaise?: number
): number {
  if (result.taxPaise !== undefined && result.taxPaise > 0) {
    return result.taxPaise;
  }
  if (result.totalPaise !== undefined) {
    if (result.subtotalPaise !== undefined && result.totalPaise > result.subtotalPaise) {
      return result.totalPaise - result.subtotalPaise;
    }
    if (itemsTotalPaise !== undefined && result.totalPaise > itemsTotalPaise) {
      return result.totalPaise - itemsTotalPaise;
    }
  }
  return 0;
}
