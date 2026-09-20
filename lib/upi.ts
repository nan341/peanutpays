const VPA_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const FIXED_NOTE = 'BudgetMitra settle up';

/**
 * Validates whether a given string is a valid UPI VPA (Virtual Payment Address).
 * Must be <= 100 characters total, trimmed, and match standard VPA format.
 */
export function isValidVpa(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  return VPA_REGEX.test(trimmed);
}

/**
 * Normalizes a UPI VPA by trimming and converting to lowercase.
 */
export function normalizeVpa(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Sanitizes a display name for inclusion in UPI URI (max 40 characters, stripped of control characters).
 */
export function sanitizePayeeName(name: string): string {
  if (!name || typeof name !== 'string') return 'User';
  // Remove control characters and limit length
  const cleaned = name.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return cleaned.slice(0, 40) || 'User';
}

export interface BuildUpiUriOptions {
  vpa: string;
  name: string;
  paise: number;
}

/**
 * Builds a standard `upi://pay` URI.
 * - `pa`: Virtual Payment Address
 * - `pn`: Payee display name
 * - `am`: Amount in INR formatted as decimal with two places (e.g., "250.00")
 * - `cu`: Currency code ("INR")
 * - `tn`: Transaction note (strictly fixed as "BudgetMitra settle up")
 */
export function buildUpiUri(options: BuildUpiUriOptions): string {
  const { vpa, name, paise } = options;

  if (!isValidVpa(vpa)) {
    throw new Error('Invalid VPA');
  }

  if (typeof paise !== 'number' || !Number.isInteger(paise) || paise <= 0) {
    throw new Error('Amount must be a positive integer in paise');
  }

  const normalizedVpa = normalizeVpa(vpa);
  const sanitizedName = sanitizePayeeName(name);
  const amountStr = (paise / 100).toFixed(2);

  const params = [
    `pa=${encodeURIComponent(normalizedVpa)}`,
    `pn=${encodeURIComponent(sanitizedName)}`,
    `am=${encodeURIComponent(amountStr)}`,
    `cu=INR`,
    `tn=${encodeURIComponent(FIXED_NOTE)}`,
  ];

  return `upi://pay?${params.join('&')}`;
}
