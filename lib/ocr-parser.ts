export interface ExtractedItem {
  id: string;
  name: string;
  price: number;
}

export interface ReceiptParseResult {
  items: ExtractedItem[];
  detectedSubtotal?: number;
  detectedTotal?: number;
}

// Metadata keywords that indicate non-item lines (header, metadata, address, contact)
const METADATA_PATTERNS = [
  /\b(invoice|inv\s*no|bill\s*no|bill\s*#|token\s*#?|order\s*#?|table\s*:?|table\s*no)\b/i,
  /\b(date\s*:?|time\s*:?|cashier\s*:?|waiter\s*:?|server\s*:?|steward\s*:?|operator\s*:?)\b/i,
  /\b(gstin\s*:?|gst\s*no\s*:?|fssai\s*:?|pan\s*no\s*:?|vat\s*no\s*:?|tax\s*invoice)\b/i,
  /\b(phone\s*:?|tel\s*:?|mobile\s*:?|contact\s*:?|email\s*:?|website\s*:?|www\.)\b/i,
  /\b(cust(omer)?\s*name|name\s*:|customer\s*:|pax\s*:|guest\s*:)\b/i,
  /\b(thank\s*you|visit\s*again|welcome|have\s*a\s*nice\s*day|see\s*you\s*soon)\b/i,
  /\b(road|street|nagar|layout|cross|main|floor|opp\.?|near|dist\.?|pin\s*:?|bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|kolkata)\b/i,
  /\b[1-9][0-9]{5}\b/, // 6-digit Indian PIN code
];

// Keywords that indicate the end of item list (summary / tax / payment footer)
const SUMMARY_STOP_PATTERNS = [
  /^(sub-?total|sub\s*total)/i,
  /^(total|grand\s*total|net\s*total|net\s*amount|total\s*amount|total\s*due|balance\s*due|amount\s*payable|net\s*payable)/i,
  /^(cgst|sgst|igst|vat|tax|gst|service\s*charge|service\s*tax|round\s*off|discount)/i,
  /^(mode\s*:?|payment|cash|card|visa|mastercard|upi|gpay|paytm|phonepe|change|paid)/i,
];

// Keywords that identify table header row
const TABLE_HEADER_PATTERN =
  /(item|description|particulars)/i;

/**
 * Extracts a numeric value from a line (the last/rightmost number on the line).
 */
function extractLastNumber(line: string): number | null {
  const match = line.match(
    /(?:(?:₹|Rs\.?|INR|\$)\s*)?([0-9]+(?:[.,][0-9]{1,2})?|[0-9]+)(?:\s*(?:₹|Rs\.?|INR|\$|\/|-|\*))?\s*$/i
  );
  if (!match) return null;
  const numStr = match[1].replace(',', '.');
  const num = parseFloat(numStr);
  return isNaN(num) ? null : num;
}

/**
 * Parses raw OCR text with table anchoring, non-item rejection,
 * rightmost column price extraction, and detected total extraction.
 */
export function parseReceiptDetails(rawText: string): ReceiptParseResult {
  if (!rawText || !rawText.trim()) {
    return { items: [] };
  }

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let tableStartIndex = -1;
  let summaryStartIndex = -1;

  let detectedSubtotal: number | undefined;
  let detectedTotal: number | undefined;

  // 1. Locate Table Header Row
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TABLE_HEADER_PATTERN.test(line) && /(price|rate|qty|quantity|amount|total|amt)/i.test(line)) {
      tableStartIndex = i;
      break;
    }
  }

  // 2. Locate Summary Start and extract detected totals from summary lines
  for (let i = Math.max(0, tableStartIndex + 1); i < lines.length; i++) {
    const line = lines[i];
    if (SUMMARY_STOP_PATTERNS.some((p) => p.test(line))) {
      if (summaryStartIndex === -1) {
        summaryStartIndex = i;
      }

      // Check for subtotal
      if (/sub-?total/i.test(line) && detectedSubtotal === undefined) {
        const val = extractLastNumber(line);
        if (val !== null && val > 0) detectedSubtotal = val;
      }

      // Check for grand total / total amount
      if (/(^total|grand\s*total|net\s*total|total\s*amount|total\s*due|amount\s*payable)/i.test(line) && !/sub-?total/i.test(line) && detectedTotal === undefined) {
        const val = extractLastNumber(line);
        if (val !== null && val > 0) detectedTotal = val;
      }
    }
  }

  // If no table header found, start from line 0
  const candidateStart = tableStartIndex !== -1 ? tableStartIndex + 1 : 0;
  const candidateEnd = summaryStartIndex !== -1 ? summaryStartIndex : lines.length;

  const candidateLines = lines.slice(candidateStart, candidateEnd);
  const items: ExtractedItem[] = [];

  for (const line of candidateLines) {
    if (line.length < 3) continue;

    // Skip divider/symbol lines
    if (/^[=\-_*#.~+]{3,}$/.test(line)) continue;

    // Reject known metadata/address lines
    if (METADATA_PATTERNS.some((pattern) => pattern.test(line))) continue;
    if (SUMMARY_STOP_PATTERNS.some((pattern) => pattern.test(line))) continue;

    // Find the rightmost number (this represents the line total in multi-column tables)
    const rightmostPrice = extractLastNumber(line);
    if (rightmostPrice === null || rightmostPrice <= 0 || rightmostPrice >= 1000000) {
      continue;
    }

    // Extract item name: everything on the line before the price and any intermediate columns (unit price, qty)
    // Example lines:
    // "Mutton biriyani   ₹400    4     ₹1600"
    // "Tandoori Roti     ₹30     5     ₹150"
    // "1x Butter Naan 40.00"
    // "Cold Coffee 120.00"

    // Remove the rightmost price match from the end of the line
    const priceMatch = line.match(
      /(?:(?:₹|Rs\.?|INR|\$)\s*)?([0-9]+(?:[.,][0-9]{1,2})?|[0-9]+)(?:\s*(?:₹|Rs\.?|INR|\$|\/|-|\*))?\s*$/i
    );
    if (!priceMatch) continue;

    let rawName = line.slice(0, priceMatch.index ?? line.lastIndexOf(priceMatch[0])).trim();

    // Strip intermediate numeric columns from the right side of the name (e.g. unit price "₹400", quantity "4")
    rawName = rawName.replace(/(?:\s+(?:₹|Rs\.?|INR|\$)?\s*\d+(?:[.,]\d+)?)+\s*$/g, '').trim();

    // Clean up leading quantity markers like "1x", "2 ", "1.", bullets, symbols
    rawName = rawName
      .replace(/^[\d]+\s*[xX*]\s*/, '')
      .replace(/^[\d]+\s*[-.)]\s*/, '')
      .replace(/^[\d]+\s+(?=[A-Za-z])/, '')
      .replace(/^[•*\->\s]+/, '')
      .replace(/[\s\-_.:]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Must have at least 2 letters
    const lettersMatch = rawName.match(/[a-zA-Z]/g);
    if (!lettersMatch || lettersMatch.length < 2) {
      continue;
    }

    // Final check that name is not a metadata keyword
    if (METADATA_PATTERNS.some((p) => p.test(rawName)) || SUMMARY_STOP_PATTERNS.some((p) => p.test(rawName))) {
      continue;
    }

    items.push({
      id: Math.random().toString(36).substring(2, 9),
      name: rawName,
      price: Math.round(rightmostPrice * 100) / 100,
    });
  }

  return {
    items,
    detectedSubtotal,
    detectedTotal,
  };
}

/**
 * Backward-compatible helper returning ExtractedItem[] directly.
 */
export function parseReceiptText(rawText: string): ExtractedItem[] {
  return parseReceiptDetails(rawText).items;
}
