import { describe, it, expect } from 'vitest';
import { calculateReceiptSplit, SplitItem } from '../lib/receiptSplit';

describe('Receipt Split Calculation (lib/receiptSplit.ts)', () => {
  // Test 10: Splitting items among members with remainder paise and proportional tax
  it('10a. splits item price of 100 paise evenly among 3 people with deterministic leftover paisa rotation', () => {
    const items: SplitItem[] = [
      { name: 'Item 1', pricePaise: 100, assignedMemberIds: ['user1', 'user2', 'user3'] },
      { name: 'Item 2', pricePaise: 100, assignedMemberIds: ['user1', 'user2', 'user3'] },
    ];
    const members = ['user1', 'user2', 'user3'];

    const res = calculateReceiptSplit(items, members, false, 0);
    expect(res.itemsTotalPaise).toBe(200);

    // Item 1 (idx 0): base 33, rem 1. user1 gets 34, user2 gets 33, user3 gets 33.
    // Item 2 (idx 1): base 33, rem 1. rotated: user2 gets 34, user3 gets 33, user1 gets 33.
    // Total for user1 = 34 + 33 = 67
    // Total for user2 = 33 + 34 = 67
    // Total for user3 = 33 + 33 = 66
    expect(res.memberTotals['user1']).toBe(67);
    expect(res.memberTotals['user2']).toBe(67);
    expect(res.memberTotals['user3']).toBe(66);

    const sum = Object.values(res.memberTotals).reduce((a, b) => a + b, 0);
    expect(sum).toBe(200);
  });

  it('10b. accurately distributes proportional tax using largest-remainder rounding with exact sum conservation', () => {
    // 3 items with different assignments:
    // User1: items total 160000 paise (53.33%)
    // User2: items total 140000 paise (46.67%)
    // Total items: 300000 paise. Tax: 15000 paise. Grand total: 315000 paise.
    const items: SplitItem[] = [
      { name: 'Mutton biriyani', pricePaise: 160000, assignedMemberIds: ['user1'] },
      { name: 'Other dishes', pricePaise: 140000, assignedMemberIds: ['user2'] },
    ];
    const members = ['user1', 'user2'];

    const res = calculateReceiptSplit(items, members, true, 15000);
    expect(res.itemsTotalPaise).toBe(300000);
    expect(res.taxPaise).toBe(15000);
    expect(res.grandTotalPaise).toBe(315000);

    // user1 tax: 15000 * 160000 / 300000 = 8000 paise
    // user2 tax: 15000 * 140000 / 300000 = 7000 paise
    expect(res.memberTaxTotals['user1']).toBe(8000);
    expect(res.memberTaxTotals['user2']).toBe(7000);

    expect(res.memberTotals['user1']).toBe(168000);
    expect(res.memberTotals['user2']).toBe(147000);

    const totalSum = res.memberTotals['user1'] + res.memberTotals['user2'];
    expect(totalSum).toBe(315000);
  });

  it('10c. flags unassigned items correctly', () => {
    const items: SplitItem[] = [
      { name: 'Item 1', pricePaise: 5000, assignedMemberIds: ['user1'] },
      { name: 'Item 2', pricePaise: 3000, assignedMemberIds: [] },
    ];
    const members = ['user1', 'user2'];

    const res = calculateReceiptSplit(items, members, false, 0);
    expect(res.unassignedCount).toBe(1);
  });
});
