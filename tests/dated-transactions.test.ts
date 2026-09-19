import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';
import {
  getUserTransactions,
  addUserTransaction,
  deleteUserTransaction,
} from '../lib/db/queries/transactions';
import crypto from 'crypto';

describe('Dated Transactions & Scoping', () => {
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
        email: 'usera@example.com',
        handle: 'usera',
        displayName: 'User A',
        passwordHash: 'hashA',
      },
      {
        id: userB,
        email: 'userb@example.com',
        handle: 'userb',
        displayName: 'User B',
        passwordHash: 'hashB',
      },
    ]);
  });

  it('stores and sorts transactions descending by user-provided date', async () => {
    const d1 = '2026-09-10T12:00:00.000Z';
    const d2 = '2026-09-15T09:30:00.000Z';
    const d3 = '2026-09-01T18:00:00.000Z';

    // Insert out of chronological order
    await addUserTransaction(userA, { amount: 100, description: 'Mid-month', category: 'Food', type: 'expense', date: d1 }, memDb as any);
    await addUserTransaction(userA, { amount: 200, description: 'Latest', category: 'Transport', type: 'expense', date: d2 }, memDb as any);
    await addUserTransaction(userA, { amount: 300, description: 'Oldest', category: 'Shopping', type: 'expense', date: d3 }, memDb as any);

    const txns = await getUserTransactions(userA, memDb as any);
    expect(txns.length).toBe(3);
    expect(txns[0].description).toBe('Latest');
    expect(txns[1].description).toBe('Mid-month');
    expect(txns[2].description).toBe('Oldest');
  });

  it('isolates dated transactions between users', async () => {
    const testDate = '2026-09-18T10:00:00.000Z';
    await addUserTransaction(userA, { amount: 50, description: 'A snack', category: 'Food', type: 'expense', date: testDate }, memDb as any);
    await addUserTransaction(userB, { amount: 80, description: 'B snack', category: 'Food', type: 'expense', date: testDate }, memDb as any);

    const txnsA = await getUserTransactions(userA, memDb as any);
    const txnsB = await getUserTransactions(userB, memDb as any);

    expect(txnsA.length).toBe(1);
    expect(txnsA[0].description).toBe('A snack');

    expect(txnsB.length).toBe(1);
    expect(txnsB[0].description).toBe('B snack');
  });

  it('allows owner to delete transaction and blocks other users', async () => {
    const txnA = await addUserTransaction(
      userA,
      { amount: 500, description: 'Rent portion', category: 'Rent', type: 'expense', date: '2026-09-05T00:00:00.000Z' },
      memDb as any
    );

    // User B attempts to delete User A transaction
    const bDeleted = await deleteUserTransaction(userB, txnA.id, memDb as any);
    expect(bDeleted).toBe(false);

    // Verify still exists for User A
    let txns = await getUserTransactions(userA, memDb as any);
    expect(txns.length).toBe(1);

    // User A deletes their own transaction
    const aDeleted = await deleteUserTransaction(userA, txnA.id, memDb as any);
    expect(aDeleted).toBe(true);

    txns = await getUserTransactions(userA, memDb as any);
    expect(txns.length).toBe(0);
  });
});
