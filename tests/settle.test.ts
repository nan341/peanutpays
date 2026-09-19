import { describe, it, expect } from 'vitest';
import {
  computeNets,
  computePairwise,
  simplifyDebts,
  splitEqually,
  SettleEntry,
} from '../lib/settle';

describe('Phase 3: Settlement Logic', () => {
  it('handles chain debts (A owes B 500, B owes C 500 -> A pays C 500)', () => {
    // A borrowed from B (B is lender, A is borrower)
    // B borrowed from C (C is lender, B is borrower)
    const entries: SettleEntry[] = [
      { lenderId: 'B', borrowerId: 'A', paise: 50000 },
      { lenderId: 'C', borrowerId: 'B', paise: 50000 },
    ];

    const nets = computeNets(entries);
    expect(nets['A']).toBe(-50000);
    expect(nets['B']).toBe(0);
    expect(nets['C']).toBe(50000);

    const plan = simplifyDebts(nets);
    expect(plan).toEqual([
      { from: 'A', to: 'C', paise: 50000 },
    ]);
  });

  it('cancels circular debts into an empty plan (A->B, B->C, C->A)', () => {
    const entries: SettleEntry[] = [
      { lenderId: 'A', borrowerId: 'B', paise: 30000 },
      { lenderId: 'B', borrowerId: 'C', paise: 30000 },
      { lenderId: 'C', borrowerId: 'A', paise: 30000 },
    ];

    const nets = computeNets(entries);
    expect(nets['A']).toBe(0);
    expect(nets['B']).toBe(0);
    expect(nets['C']).toBe(0);

    const plan = simplifyDebts(nets);
    expect(plan).toEqual([]);
  });

  it('correctly computes pairwise direct debts', () => {
    const entries: SettleEntry[] = [
      { lenderId: 'A', borrowerId: 'B', paise: 10000 },
      { lenderId: 'B', borrowerId: 'A', paise: 4000 },
      { lenderId: 'A', borrowerId: 'C', paise: 6000 },
    ];

    const pairwise = computePairwise(entries);
    expect(pairwise).toEqual([
      { from: 'B', to: 'A', paise: 6000 },
      { from: 'C', to: 'A', paise: 6000 },
    ]);
  });

  it('splitEqually preserves exact sum and assigns remainders deterministically', () => {
    // 100 paise split 3 ways: 34, 33, 33
    const split3 = splitEqually(100, ['u1', 'u2', 'u3']);
    expect(split3['u1']).toBe(34);
    expect(split3['u2']).toBe(33);
    expect(split3['u3']).toBe(33);
    expect(split3['u1'] + split3['u2'] + split3['u3']).toBe(100);

    // Test with 500 random cases of totals and participant counts
    for (let i = 0; i < 500; i++) {
      const total = Math.floor(Math.random() * 1000000) + 1;
      const count = Math.floor(Math.random() * 20) + 1;
      const ids = Array.from({ length: count }, (_, idx) => `user_${idx}`);

      const parts = splitEqually(total, ids);
      const sum = Object.values(parts).reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
    }
  });

  it('partial payments leave the exact remainder balance', () => {
    const loan: SettleEntry = { lenderId: 'A', borrowerId: 'B', paise: 100000 };
    // B pays A 400.00
    const payment: SettleEntry = { lenderId: 'B', borrowerId: 'A', paise: 40000 };

    const nets = computeNets([loan, payment]);
    expect(nets['A']).toBe(60000);
    expect(nets['B']).toBe(-60000);

    const plan = simplifyDebts(nets);
    expect(plan).toEqual([{ from: 'B', to: 'A', paise: 60000 }]);
  });

  it('verifies plan length <= n - 1 and applies plan to zero all nets across 200 random scenarios', () => {
    // Linear Congruential Generator for reproducible seeded randomness
    let seed = 42;
    function pseudoRandom() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    for (let sim = 0; sim < 200; sim++) {
      const numUsers = Math.floor(pseudoRandom() * 10) + 2; // 2 to 11 users
      const userIds = Array.from({ length: numUsers }, (_, i) => `user_${i}`);
      const numEntries = Math.floor(pseudoRandom() * 30) + 1;

      const entries: SettleEntry[] = [];
      for (let e = 0; e < numEntries; e++) {
        const u1 = Math.floor(pseudoRandom() * numUsers);
        let u2 = Math.floor(pseudoRandom() * numUsers);
        while (u2 === u1) {
          u2 = Math.floor(pseudoRandom() * numUsers);
        }
        const amount = Math.floor(pseudoRandom() * 50000) + 1;
        entries.push({
          lenderId: userIds[u1],
          borrowerId: userIds[u2],
          paise: amount,
        });
      }

      const nets = computeNets(entries);
      const plan = simplifyDebts(nets);

      // (1) Max payments is n - 1
      const nonZeroParticipants = Object.values(nets).filter((n) => n !== 0).length;
      const maxPayments = Math.max(0, nonZeroParticipants - 1);
      expect(plan.length).toBeLessThanOrEqual(maxPayments);

      // (2) Applying the plan as payments zeroes out all nets
      const simulatedNets: Record<string, number> = { ...nets };
      for (const p of plan) {
        simulatedNets[p.from] += p.paise;
        simulatedNets[p.to] -= p.paise;
      }

      for (const [id, bal] of Object.entries(simulatedNets)) {
        expect(bal).toBe(0);
      }
    }
  });
});
