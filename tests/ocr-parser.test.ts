import { describe, it, expect } from 'vitest';
import { parseReceiptDetails, parseReceiptText } from '../lib/ocr-parser';

describe('OCR Receipt Parser', () => {
  it('anchors to item table, discards metadata/addresses, extracts rightmost line total, and detects totals', () => {
    const raw = `
      ROYAL SPICE RESTAURANT
      12 MG Road, Indiranagar, Bengaluru - 560038
      GSTIN: 29ABCDE1234F1Z5
      Name: Rahul Sharma
      Invoice No: INV-88219
      Table: 4
      Date: 20/09/2026

      Item              Price   Qty   Total
      Mutton biriyani   ₹400    4     ₹1600
      Tandoori Roti     ₹30     5     ₹150
      Chilly chicken    ₹250    2     ₹500
      Chicken pepper    ₹250    3     ₹750

      Sub-Total: ₹3000
      CGST 2.5%: ₹75
      SGST 2.5%: ₹75
      Total: ₹3150
      Mode: UPI
      Thank you for dining with us!
    `;

    const result = parseReceiptDetails(raw);

    expect(result.items.length).toBe(4);

    expect(result.items[0].name).toBe('Mutton biriyani');
    expect(result.items[0].price).toBe(1600);

    expect(result.items[1].name).toBe('Tandoori Roti');
    expect(result.items[1].price).toBe(150);

    expect(result.items[2].name).toBe('Chilly chicken');
    expect(result.items[2].price).toBe(500);

    expect(result.items[3].name).toBe('Chicken pepper');
    expect(result.items[3].price).toBe(750);

    const itemsSum = result.items.reduce((acc, item) => acc + item.price, 0);
    expect(itemsSum).toBe(3000); // Exact sub-total

    expect(result.detectedSubtotal).toBe(3000);
    expect(result.detectedTotal).toBe(3150);
  });

  it('parses standard single-column receipts with no table header', () => {
    const raw = `
      1x Butter Naan       40.00
      2x Paneer Tikka     240.50
      1 Fresh Lime Soda    60.00
      Cold Coffee         120.00
      Subtotal            460.50
      Total:              483.52
    `;

    const result = parseReceiptDetails(raw);
    expect(result.items.length).toBe(4);
    expect(result.items[0].name).toBe('Butter Naan');
    expect(result.items[0].price).toBe(40);
    expect(result.items[1].name).toBe('Paneer Tikka');
    expect(result.items[1].price).toBe(240.5);
    expect(result.items[2].name).toBe('Fresh Lime Soda');
    expect(result.items[2].price).toBe(60);
    expect(result.items[3].name).toBe('Cold Coffee');
    expect(result.items[3].price).toBe(120);
    expect(result.detectedSubtotal).toBe(460.5);
    expect(result.detectedTotal).toBe(483.52);
  });

  it('returns empty array on blurry / garbage text', () => {
    const raw = `
      ~~~ @@@ &&& ***
      Hello this is a random blurry photo
      No prices anywhere
    `;

    const result = parseReceiptDetails(raw);
    expect(result.items).toEqual([]);
  });
});
