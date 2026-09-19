import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';
import {
  getBudgetLimitsByUser,
  upsertBudgetLimit,
  deleteBudgetLimit,
} from '../lib/db/queries/budget-limits';
import crypto from 'crypto';

describe('Budgeting and Limits Scoping', () => {
  let memDb: ReturnType<typeof drizzle>;
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();

  beforeEach(async () => {
    const memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    await memDb.insert(schema.users).values([
      {
        id: userA,
        email: 'usera_budget@example.com',
        handle: 'userabudget',
        displayName: 'User A Budget',
        passwordHash: 'hashA',
      },
      {
        id: userB,
        email: 'userb_budget@example.com',
        handle: 'userbbudget',
        displayName: 'User B Budget',
        passwordHash: 'hashB',
      },
    ]);
  });

  it('allows user to upsert and retrieve budget limits', async () => {
    await upsertBudgetLimit(userA, 'Food & Drinks', 5000, memDb as any);
    await upsertBudgetLimit(userA, 'Entertainment', 2000, memDb as any);

    const limits = await getBudgetLimitsByUser(userA, memDb as any);
    expect(limits.length).toBe(2);

    const food = limits.find((l) => l.category === 'Food & Drinks');
    expect(food?.monthlyLimit).toBe(5000);

    // Update food limit
    await upsertBudgetLimit(userA, 'Food & Drinks', 6000, memDb as any);
    const updatedLimits = await getBudgetLimitsByUser(userA, memDb as any);
    expect(updatedLimits.length).toBe(2);
    const updatedFood = updatedLimits.find((l) => l.category === 'Food & Drinks');
    expect(updatedFood?.monthlyLimit).toBe(6000);
  });

  it('strictly isolates budget limits between users', async () => {
    await upsertBudgetLimit(userA, 'Food & Drinks', 5000, memDb as any);
    await upsertBudgetLimit(userB, 'Food & Drinks', 10000, memDb as any);

    const limitsA = await getBudgetLimitsByUser(userA, memDb as any);
    const limitsB = await getBudgetLimitsByUser(userB, memDb as any);

    expect(limitsA.length).toBe(1);
    expect(limitsA[0].monthlyLimit).toBe(5000);

    expect(limitsB.length).toBe(1);
    expect(limitsB[0].monthlyLimit).toBe(10000);
  });

  it('allows user to delete a budget limit without affecting other users', async () => {
    await upsertBudgetLimit(userA, 'Travel', 3000, memDb as any);
    await upsertBudgetLimit(userB, 'Travel', 8000, memDb as any);

    const deleted = await deleteBudgetLimit(userA, 'Travel', memDb as any);
    expect(deleted).toBe(true);

    const limitsA = await getBudgetLimitsByUser(userA, memDb as any);
    expect(limitsA.length).toBe(0);

    const limitsB = await getBudgetLimitsByUser(userB, memDb as any);
    expect(limitsB.length).toBe(1);
    expect(limitsB[0].monthlyLimit).toBe(8000);
  });
});
