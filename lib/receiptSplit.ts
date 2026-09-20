export interface SplitItem {
  name: string;
  pricePaise: number;
  assignedMemberIds: string[];
}

export interface SplitResult {
  /** Map of memberId -> total owed in paise (items + proportional tax) */
  memberTotals: Record<string, number>;
  /** Map of memberId -> item portion in paise */
  memberItemTotals: Record<string, number>;
  /** Map of memberId -> tax portion in paise */
  memberTaxTotals: Record<string, number>;
  /** Total sum of all item prices in paise */
  itemsTotalPaise: number;
  /** Total tax amount in paise (if tax included) */
  taxPaise: number;
  /** Grand total in paise */
  grandTotalPaise: number;
  /** Count of items with 0 assigned members */
  unassignedCount: number;
}

/**
 * Split items among assigned members and optionally allocate tax proportionally
 * using largest-remainder rounding.
 */
export function calculateReceiptSplit(
  items: SplitItem[],
  allMemberIds: string[],
  includeTax: boolean,
  taxPaise: number = 0
): SplitResult {
  const memberItemTotals: Record<string, number> = {};
  const memberTaxTotals: Record<string, number> = {};
  const memberTotals: Record<string, number> = {};

  for (const mid of allMemberIds) {
    memberItemTotals[mid] = 0;
    memberTaxTotals[mid] = 0;
    memberTotals[mid] = 0;
  }

  let itemsTotalPaise = 0;
  let unassignedCount = 0;

  // 1. Distribute each item's price among its assigned members
  items.forEach((item, itemIdx) => {
    itemsTotalPaise += item.pricePaise;

    const assigned = item.assignedMemberIds;
    if (assigned.length === 0) {
      unassignedCount++;
      return;
    }

    const count = assigned.length;
    const baseShare = Math.floor(item.pricePaise / count);
    const remainder = item.pricePaise % count;

    // Distribute with deterministic rotation by itemIdx
    for (let j = 0; j < count; j++) {
      const assignedIdx = (itemIdx + j) % count;
      const memberId = assigned[assignedIdx];
      const extra = j < remainder ? 1 : 0;
      const share = baseShare + extra;
      memberItemTotals[memberId] = (memberItemTotals[memberId] ?? 0) + share;
    }
  });

  const effectiveTaxPaise = includeTax && taxPaise > 0 ? taxPaise : 0;

  // 2. Proportional tax allocation using largest-remainder method (Hare-Niemeyer)
  if (effectiveTaxPaise > 0 && itemsTotalPaise > 0) {
    const allocations: { memberId: string; base: number; remainder: number; originalIdx: number }[] = [];
    let allocatedBaseSum = 0;

    allMemberIds.forEach((mid, idx) => {
      const personItemSum = memberItemTotals[mid] ?? 0;
      const exactShare = (effectiveTaxPaise * personItemSum) / itemsTotalPaise;
      const base = Math.floor(exactShare);
      const rem = exactShare - base;
      allocations.push({
        memberId: mid,
        base,
        remainder: rem,
        originalIdx: idx,
      });
      allocatedBaseSum += base;
    });

    let unallocatedPaise = effectiveTaxPaise - allocatedBaseSum;

    // Sort by largest remainder descending, tie-break by original order
    allocations.sort((a, b) => b.remainder - a.remainder || a.originalIdx - b.originalIdx);

    for (const alloc of allocations) {
      const extra = unallocatedPaise > 0 ? 1 : 0;
      memberTaxTotals[alloc.memberId] = alloc.base + extra;
      if (unallocatedPaise > 0) unallocatedPaise--;
    }
  }

  // 3. Compute final totals
  for (const mid of allMemberIds) {
    const itemPaise = memberItemTotals[mid] ?? 0;
    const taxP = memberTaxTotals[mid] ?? 0;
    memberTotals[mid] = itemPaise + taxP;
  }

  const grandTotalPaise = itemsTotalPaise + effectiveTaxPaise;

  return {
    memberTotals,
    memberItemTotals,
    memberTaxTotals,
    itemsTotalPaise,
    taxPaise: effectiveTaxPaise,
    grandTotalPaise,
    unassignedCount,
  };
}
