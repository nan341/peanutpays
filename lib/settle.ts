export interface SettleEntry {
  lenderId: string;
  borrowerId: string;
  paise: number;
}

export interface PairwiseDebt {
  from: string;
  to: string;
  paise: number;
}

export interface SimplifiedPayment {
  from: string;
  to: string;
  paise: number;
}

/**
 * Computes net balances for all participants.
 * Positive net = is owed money (creditor).
 * Negative net = owes money (debtor).
 * Throws if the sum of all nets is not exactly 0.
 */
export function computeNets(entries: SettleEntry[]): Record<string, number> {
  const nets: Record<string, number> = {};

  for (const entry of entries) {
    if (!entry.paise || entry.paise <= 0) continue;
    nets[entry.lenderId] = (nets[entry.lenderId] ?? 0) + entry.paise;
    nets[entry.borrowerId] = (nets[entry.borrowerId] ?? 0) - entry.paise;
  }

  const sum = Object.values(nets).reduce((a, b) => a + b, 0);
  if (sum !== 0) {
    throw new Error(`Net balances do not sum to 0. Found sum: ${sum}`);
  }

  return nets;
}

/**
 * Computes pairwise direct net debts between each pair of individuals.
 * Drops pairs whose net debt is zero.
 */
export function computePairwise(entries: SettleEntry[]): PairwiseDebt[] {
  const pairBalances: Record<string, number> = {};

  for (const entry of entries) {
    if (!entry.paise || entry.paise <= 0 || entry.lenderId === entry.borrowerId) continue;
    const [p1, p2] = [entry.lenderId, entry.borrowerId].sort();
    const key = `${p1}:${p2}`;

    // If lender is p1, p2 owes p1 (positive)
    if (entry.lenderId === p1) {
      pairBalances[key] = (pairBalances[key] ?? 0) + entry.paise;
    } else {
      pairBalances[key] = (pairBalances[key] ?? 0) - entry.paise;
    }
  }

  const result: PairwiseDebt[] = [];

  for (const [key, balance] of Object.entries(pairBalances)) {
    if (balance === 0) continue;
    const [p1, p2] = key.split(':');
    if (balance > 0) {
      // p2 owes p1
      result.push({ from: p2, to: p1, paise: balance });
    } else {
      // p1 owes p2
      result.push({ from: p1, to: p2, paise: -balance });
    }
  }

  return result.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/**
 * Greedy debt simplification plan that minimizes the total number of payments.
 * Matches the largest debtor with the largest creditor iteratively.
 * Uses deterministic tie-breaking by ID.
 * Produces at most n-1 payments.
 */
export function simplifyDebts(nets: Record<string, number>): SimplifiedPayment[] {
  const debtors: { id: string; debt: number }[] = [];
  const creditors: { id: string; credit: number }[] = [];

  for (const [id, net] of Object.entries(nets)) {
    if (net < 0) {
      debtors.push({ id, debt: -net });
    } else if (net > 0) {
      creditors.push({ id, credit: net });
    }
  }

  const sortDebtors = () =>
    debtors.sort((a, b) => b.debt - a.debt || a.id.localeCompare(b.id));
  const sortCreditors = () =>
    creditors.sort((a, b) => b.credit - a.credit || a.id.localeCompare(b.id));

  sortDebtors();
  sortCreditors();

  const payments: SimplifiedPayment[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];

    const amount = Math.min(debtor.debt, creditor.credit);
    if (amount > 0) {
      payments.push({
        from: debtor.id,
        to: creditor.id,
        paise: amount,
      });

      debtor.debt -= amount;
      creditor.credit -= amount;
    }

    if (debtor.debt === 0) {
      debtors.shift();
    }
    if (creditor.credit === 0) {
      creditors.shift();
    }

    sortDebtors();
    sortCreditors();
  }

  return payments;
}

/**
 * Splits totalPaise equally among participantIds.
 * Remainder paise are assigned deterministically to the lowest IDs.
 * The sum of returned amounts always equals totalPaise.
 */
export function splitEqually(totalPaise: number, participantIds: string[]): Record<string, number> {
  if (participantIds.length === 0) return {};
  if (totalPaise < 0) {
    throw new Error('Total paise must be non-negative');
  }

  const uniqueSorted = Array.from(new Set(participantIds)).sort();
  const count = uniqueSorted.length;
  if (count === 0) return {};

  const base = Math.floor(totalPaise / count);
  let remainder = totalPaise % count;

  const result: Record<string, number> = {};
  for (const id of uniqueSorted) {
    const extra = remainder > 0 ? 1 : 0;
    result[id] = base + extra;
    if (remainder > 0) remainder--;
  }

  return result;
}
