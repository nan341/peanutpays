import { describe, it, expect } from 'vitest';
import {
  parseReceipt,
  compareToReceipt,
  extraChargesPaise,
} from '../lib/receiptParser';

const FIXTURE_TEXT = `Spice Garden Restaurant
12 MG Road, Indiranagar, Bengaluru 560038
GST No: 29ABCDE1234F1Z5
Name: Rohan
Invoice No: 10482
Table: 7
Date: 12/09/2026
Item Price Qty Total
Mutton biriyani ₹400 4 ₹1600
Tandoori Roti ₹30 5 ₹150
Chilly chicken ₹250 2 ₹500
Chicken pepper ₹250 3 ₹750
Sub-Total ₹3000
CGST 2.5% ₹75
SGST 2.5% ₹75
Total ₹3150
Mode: UPI
Thank you, visit again`;

describe('Pure Receipt Parser (lib/receiptParser.ts) - 17 Unit Tests', () => {
  // Test 1: Standard fixture extracts exactly 4 items in paise with no rejected header/footer lines
  it('1. extracts exactly 4 items in paise with no metadata/footer lines and no digits in names', () => {
    const res = parseReceipt(FIXTURE_TEXT);
    expect(res.tableFound).toBe(true);
    expect(res.items).toHaveLength(4);

    expect(res.items[0]).toEqual({
      name: 'Mutton biriyani',
      pricePaise: 160000,
    });
    expect(res.items[1]).toEqual({
      name: 'Tandoori Roti',
      pricePaise: 15000,
    });
    expect(res.items[2]).toEqual({
      name: 'Chilly chicken',
      pricePaise: 50000,
    });
    expect(res.items[3]).toEqual({
      name: 'Chicken pepper',
      pricePaise: 75000,
    });

    for (const item of res.items) {
      expect(item.name).not.toMatch(/\d/);
    }
  });

  // Test 2: Subtotal, total, tax extraction and exact sum match
  it('2. extracts subtotalPaise 300000, totalPaise 315000, taxPaise 15000', () => {
    const res = parseReceipt(FIXTURE_TEXT);
    expect(res.subtotalPaise).toBe(300000);
    expect(res.totalPaise).toBe(315000);
    expect(res.taxPaise).toBe(15000);

    const itemsSum = res.items.reduce((acc, item) => acc + item.pricePaise, 0);
    expect(itemsSum).toBe(res.subtotalPaise);
  });

  // Test 3: Rupee misread repair on both price and total (2400 4 21600 -> 400 x 4 = 1600)
  it('3. repairs rupee misread variant (2400 4 21600 -> 400 x 4 = 1600)', () => {
    const textWithMisread = FIXTURE_TEXT.replace(
      'Mutton biriyani ₹400 4 ₹1600',
      'Mutton biriyani 2400 4 21600'
    );
    const res = parseReceipt(textWithMisread);
    const muttonItem = res.items.find((it) => it.name.includes('Mutton'));
    expect(muttonItem).toBeDefined();
    expect(muttonItem?.pricePaise).toBe(160000);
    expect(muttonItem?.repaired).toBe(true);
  });

  // Test 4: Rupee misread repair when only price has leading digit (2400 4 1600 -> 400 x 4 = 1600)
  it('4. repairs leading digit in unit price token (2400 4 1600)', () => {
    const text = `Item Price Qty Total\nMutton biriyani 2400 4 1600\nTotal 1600`;
    const res = parseReceipt(text);
    expect(res.items[0].pricePaise).toBe(160000);
    expect(res.items[0].repaired).toBe(true);
  });

  // Test 5: Rupee misread repair when only total has leading digit (400 4 21600 -> 400 x 4 = 1600)
  it('5. repairs leading digit in total token (400 4 21600)', () => {
    const text = `Item Price Qty Total\nMutton biriyani 400 4 21600\nTotal 1600`;
    const res = parseReceipt(text);
    expect(res.items[0].pricePaise).toBe(160000);
    expect(res.items[0].repaired).toBe(true);
  });

  // Test 6: Single token price line marked unverified
  it('6. marks single price token lines as unverified', () => {
    const text = `Item Total\nMutton biriyani 1600\nTotal 1600`;
    const res = parseReceipt(text);
    expect(res.items[0].pricePaise).toBe(160000);
    expect(res.items[0].unverified).toBe(true);
  });

  // Test 7: Missing header row fallback with 'no-table-header' note
  it('7. handles missing header row with fallback and tableFound=false', () => {
    const textNoHeader = FIXTURE_TEXT.replace('Item Price Qty Total\n', '');
    const res = parseReceipt(textNoHeader);
    expect(res.tableFound).toBe(false);
    expect(res.notes).toContain('no-table-header');
    expect(res.items).toHaveLength(4);
    expect(res.items[0].name).toBe('Mutton biriyani');
    expect(res.items[0].pricePaise).toBe(160000);
  });

  // Test 8: Missing end line with 'no-end-line' note
  it('8. records no-end-line note when no summary line is found after header', () => {
    const textNoEnd = `Item Price Qty Total\nMutton biriyani 400 4 1600\nTandoori Roti 30 5 150`;
    const res = parseReceipt(textNoEnd);
    expect(res.tableFound).toBe(true);
    expect(res.notes).toContain('no-end-line');
    expect(res.items).toHaveLength(2);
  });

  // Test 9: Multiline wrapped item name joined correctly
  it('9. joins multiline wrapped item names correctly', () => {
    const wrappedText = `Item Price Qty Total
Special Chicken
Biriyani ₹250 2 ₹500
Tandoori Roti ₹30 5 ₹150
Sub-Total ₹650`;
    const res = parseReceipt(wrappedText);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].name).toBe('Special Chicken Biriyani');
    expect(res.items[0].pricePaise).toBe(50000);
  });

  // Test 10: Header misread detection ('ltem Price Qty Total')
  it('10. detects OCR misreads in header like "ltem Price Qty Total"', () => {
    const misreadHeaderText = FIXTURE_TEXT.replace('Item Price Qty Total', 'ltem Price Qty Total');
    const res = parseReceipt(misreadHeaderText);
    expect(res.tableFound).toBe(true);
    expect(res.items).toHaveLength(4);
  });

  // Test 11: Garbage or empty input returns zero items and 'no-table-header' note
  it('11. returns zero items on garbage text or empty input', () => {
    const emptyRes = parseReceipt('');
    expect(emptyRes.items).toEqual([]);
    expect(emptyRes.tableFound).toBe(false);
    expect(emptyRes.notes).toContain('no-table-header');

    const garbageRes = parseReceipt('Hello world\nThis is just a random note with no numbers');
    expect(garbageRes.items).toEqual([]);
    expect(garbageRes.tableFound).toBe(false);
  });

  // Test 12: Reject rule: 6-digit pincode line
  it('12. rejects lines containing 6-digit pincodes', () => {
    const text = `Item Total\nBengaluru 560038 500\nMutton biriyani 1600\nTotal 1600`;
    const res = parseReceipt(text);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Mutton biriyani');
  });

  // Test 13: Reject rule: address line with 2+ commas
  it('13. rejects lines with 2 or more commas', () => {
    const text = `Item Total\nShop 12, MG Road, Bengaluru 500\nMutton biriyani 1600\nTotal 1600`;
    const res = parseReceipt(text);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Mutton biriyani');
  });

  // Test 14: Reject rule: non-alphabetic lines
  it('14. rejects lines without alphabetic characters', () => {
    const text = `Item Total\n----------------- 500\n12345 67890\nMutton biriyani 1600\nTotal 1600`;
    const res = parseReceipt(text);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Mutton biriyani');
  });

  // Test 15: compareToReceipt: match against subtotal
  it('15. compareToReceipt returns match against subtotal', () => {
    const comp = compareToReceipt(300000, { subtotalPaise: 300000, totalPaise: 315000 });
    expect(comp).toEqual({
      status: 'match',
      kind: 'sub-total',
      amountPaise: 300000,
    });
  });

  // Test 16: compareToReceipt: match total, mismatch, extra, unknown
  it('16. compareToReceipt covers match total, mismatch, extra, and unknown', () => {
    // Match against total
    const compTotal = compareToReceipt(300000, { totalPaise: 300000 });
    expect(compTotal).toEqual({
      status: 'match',
      kind: 'total',
      amountPaise: 300000,
    });

    // Mismatch against subtotal
    const compMisSub = compareToReceipt(250000, { subtotalPaise: 300000, totalPaise: 315000 });
    expect(compMisSub).toEqual({
      status: 'mismatch',
      kind: 'sub-total',
      itemsTotalPaise: 250000,
      receiptTotalPaise: 300000,
    });

    // Extra charges (when no subtotal, but total > items)
    const compExtra = compareToReceipt(300000, { totalPaise: 315000 });
    expect(compExtra).toEqual({
      status: 'extra',
      receiptTotalPaise: 315000,
      extraPaise: 15000,
    });

    // Unknown
    const compUnknown = compareToReceipt(0, {});
    expect(compUnknown).toEqual({ status: 'unknown' });
  });

  // Test 17: extraChargesPaise calculation
  it('17. extraChargesPaise calculates tax/extra charges accurately', () => {
    // From taxPaise
    expect(extraChargesPaise({ taxPaise: 15000, totalPaise: 315000, subtotalPaise: 300000 })).toBe(15000);
    // From total - subtotal
    expect(extraChargesPaise({ totalPaise: 315000, subtotalPaise: 300000 })).toBe(15000);
    // From total - items
    expect(extraChargesPaise({ totalPaise: 315000 }, 300000)).toBe(15000);
    // Zero extra
    expect(extraChargesPaise({ totalPaise: 300000, subtotalPaise: 300000 })).toBe(0);
  });
});
