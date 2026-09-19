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
import {
  getPersonalFriendsAndEntries,
  findOrCreateFriend,
  addPersonalLendingEntry,
  settlePersonalLendingEntry,
  deletePersonalLendingEntry,
} from '../lib/db/queries/personal-lending';
import { clearUserData } from '../lib/db/queries/user-data';
import bcrypt from 'bcryptjs';

describe('Phase 2: Auth and Per-User Data Privacy', () => {
  let memDb: ReturnType<typeof drizzle>;
  let userAId = 'user-a-uuid';
  let userBId = 'user-b-uuid';

  beforeEach(async () => {
    const memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    // Insert two users
    const hash = await bcrypt.hash('Password123!', 12);
    await memDb.insert(schema.users).values([
      {
        id: userAId,
        email: 'usera@example.com',
        handle: 'usera',
        displayName: 'User A',
        passwordHash: hash,
      },
      {
        id: userBId,
        email: 'userb@example.com',
        handle: 'userb',
        displayName: 'User B',
        passwordHash: hash,
      },
    ]);
  });

  it('user A cannot read or delete user B transactions', async () => {
    const txnB = await addUserTransaction(
      userBId,
      {
        amount: 500,
        description: 'Secret lunch',
        category: 'Food',
        type: 'expense',
      },
      memDb as any
    );

    // User A reads their transactions
    const txnsA = await getUserTransactions(userAId, memDb as any);
    expect(txnsA.length).toBe(0);

    // User A attempts to delete User B transaction
    const deletedByA = await deleteUserTransaction(userAId, txnB.id, memDb as any);
    expect(deletedByA).toBe(false);

    // Verify User B transaction still exists
    const txnsB = await getUserTransactions(userBId, memDb as any);
    expect(txnsB.length).toBe(1);
    expect(txnsB[0].description).toBe('Secret lunch');
  });

  it('user A cannot read, settle or delete user B personal lending entries', async () => {
    const entryB = await addPersonalLendingEntry(
      userBId,
      {
        friendName: 'Rahul',
        amount: 200,
        direction: 'lent',
        note: 'Movie ticket',
      },
      memDb as any
    );

    // User A gets personal lending
    const friendsA = await getPersonalFriendsAndEntries(userAId, memDb as any);
    expect(friendsA.length).toBe(0);

    // User A tries to settle User B entry
    const settledByA = await settlePersonalLendingEntry(userAId, entryB.id, memDb as any);
    expect(settledByA).toBe(false);

    // User A tries to delete User B entry
    const deletedByA = await deletePersonalLendingEntry(userAId, entryB.id, memDb as any);
    expect(deletedByA).toBe(false);

    // User B settles their entry
    const settledByB = await settlePersonalLendingEntry(userBId, entryB.id, memDb as any);
    expect(settledByB).toBe(true);
  });

  it('friend names match case-insensitively per user with trimmed spaces', async () => {
    const friend1 = await findOrCreateFriend(userAId, '  Rohan   Sharma  ', memDb as any);
    const friend2 = await findOrCreateFriend(userAId, 'rohan sharma', memDb as any);
    expect(friend1.id).toBe(friend2.id);
    expect(friend1.name).toBe('Rohan Sharma');

    // Friend name for User B with same name is separate
    const friendB = await findOrCreateFriend(userBId, 'Rohan Sharma', memDb as any);
    expect(friendB.id).not.toBe(friend1.id);
  });

  it('DELETE /api/data (clearUserData) for User A leaves User B data intact', async () => {
    await addUserTransaction(userAId, { amount: 100, description: 'A tea', category: 'Food', type: 'expense' }, memDb as any);
    await addPersonalLendingEntry(userAId, { friendName: 'Alice', amount: 50, direction: 'lent' }, memDb as any);

    await addUserTransaction(userBId, { amount: 200, description: 'B coffee', category: 'Food', type: 'expense' }, memDb as any);
    await addPersonalLendingEntry(userBId, { friendName: 'Bob', amount: 80, direction: 'lent' }, memDb as any);

    // Clear user A data
    await clearUserData(userAId, memDb as any);

    const txnsA = await getUserTransactions(userAId, memDb as any);
    const lendingA = await getPersonalFriendsAndEntries(userAId, memDb as any);
    expect(txnsA.length).toBe(0);
    expect(lendingA.length).toBe(0);

    const txnsB = await getUserTransactions(userBId, memDb as any);
    const lendingB = await getPersonalFriendsAndEntries(userBId, memDb as any);
    expect(txnsB.length).toBe(1);
    expect(lendingB.length).toBe(1);
    expect(lendingB[0].name).toBe('Bob');
  });
});
