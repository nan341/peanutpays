import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';
import { createSharedItemizedSplit } from '../lib/db/queries/shared-entries';

describe('Server-side Receipt Itemized Split Validation (Case 11)', () => {
  let memDb: any;
  const user1 = 'u1';
  const user2 = 'u2';
  const foreignUser = 'uForeign';
  const groupId = 'g1';

  beforeEach(async () => {
    const memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    // Insert users
    await memDb.insert(schema.users).values([
      {
        id: user1,
        email: 'user1@example.com',
        displayName: 'User One',
        handle: 'user1_handle',
        passwordHash: 'hashed',
        createdAt: new Date().toISOString(),
      },
      {
        id: user2,
        email: 'user2@example.com',
        displayName: 'User Two',
        handle: 'user2_handle',
        passwordHash: 'hashed',
        createdAt: new Date().toISOString(),
      },
      {
        id: foreignUser,
        email: 'foreign@example.com',
        displayName: 'Foreign User',
        handle: 'foreign_handle',
        passwordHash: 'hashed',
        createdAt: new Date().toISOString(),
      },
    ]);

    // Insert group and active members (only user1 and user2)
    await memDb.insert(schema.groups).values({
      id: groupId,
      name: 'Test Split Group',
      type: 'group',
      createdBy: user1,
      createdAt: new Date().toISOString(),
    });

    await memDb.insert(schema.groupMembers).values([
      {
        id: 'gm1',
        groupId,
        userId: user1,
        role: 'admin',
        status: 'active',
        joinedAt: new Date().toISOString(),
      },
      {
        id: 'gm2',
        groupId,
        userId: user2,
        role: 'member',
        status: 'active',
        joinedAt: new Date().toISOString(),
      },
    ]);
  });

  it('11a. rejects borrower outside the ledger', async () => {
    await expect(
      createSharedItemizedSplit(
        user1,
        groupId,
        {
          payerId: user1,
          totalPaise: 300000,
          splits: [{ borrowerId: foreignUser, paise: 150000 }],
        },
        memDb
      )
    ).rejects.toThrow(/not an active member/i);
  });

  it('11b. rejects non-positive or non-integer amounts', async () => {
    await expect(
      createSharedItemizedSplit(
        user1,
        groupId,
        {
          payerId: user1,
          totalPaise: 300000,
          splits: [{ borrowerId: user2, paise: -5000 }],
        },
        memDb
      )
    ).rejects.toThrow(/positive integer/i);

    await expect(
      createSharedItemizedSplit(
        user1,
        groupId,
        {
          payerId: user1,
          totalPaise: 300000,
          splits: [{ borrowerId: user2, paise: 123.45 }],
        },
        memDb
      )
    ).rejects.toThrow(/positive integer/i);
  });

  it('11c. rejects if borrower shares exceed total amount', async () => {
    await expect(
      createSharedItemizedSplit(
        user1,
        groupId,
        {
          payerId: user1,
          totalPaise: 100000,
          splits: [{ borrowerId: user2, paise: 150000 }],
        },
        memDb
      )
    ).rejects.toThrow(/cannot exceed total amount/i);
  });

  it('11d. successfully records loans for valid borrower shares', async () => {
    const res = await createSharedItemizedSplit(
      user1,
      groupId,
      {
        payerId: user1,
        totalPaise: 300000,
        splits: [{ borrowerId: user2, paise: 140000, note: 'Dinner (Tandoori Roti)' }],
        description: 'Dinner',
      },
      memDb
    );

    expect(res.batchId).toBeDefined();
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].borrowerId).toBe(user2);
    expect(res.entries[0].lenderId).toBe(user1);
    expect(res.entries[0].paise).toBe(140000);
    expect(res.entries[0].kind).toBe('loan');
    expect(res.entries[0].status).toBe('confirmed');
  });
});
