import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';
import {
  sendConnectionRequest,
  respondToConnectionRequest,
  getConnections,
} from '../lib/db/queries/connections';
import {
  createGroup,
  inviteMembersToGroup,
  respondToGroupInvite,
  leaveGroup,
} from '../lib/db/queries/groups';
import {
  getGroupDetails,
  createSharedExpenseSplit,
  recordPayment,
  confirmOrRejectPayment,
} from '../lib/db/queries/shared-entries';
import { clearUserData } from '../lib/db/queries/user-data';
import bcrypt from 'bcryptjs';

describe('End-to-End Multi-User Scenario Verification', () => {
  let memDb: ReturnType<typeof drizzle>;
  const userA = { id: 'u-alice', email: 'alice@mitra.test', handle: 'alice_01', displayName: 'Alice' };
  const userB = { id: 'u-bob', email: 'bob@mitra.test', handle: 'bob_02', displayName: 'Bob' };
  const userC = { id: 'u-charlie', email: 'charlie@mitra.test', handle: 'charlie_03', displayName: 'Charlie' };

  beforeEach(async () => {
    const memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    const hash = await bcrypt.hash('SecurePass123!', 12);
    await memDb.insert(schema.users).values([
      { ...userA, passwordHash: hash },
      { ...userB, passwordHash: hash },
      { ...userC, passwordHash: hash },
    ]);
  });

  it('verifies passwords stored strictly as bcrypt hashes', async () => {
    const rows = await memDb.select().from(schema.users);
    for (const r of rows) {
      expect(r.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(r.passwordHash).not.toContain('SecurePass123!');
    }
  });

  it('completes 3-user group workflow with indivisible split, pending payment, confirmation, and zero balance', async () => {
    // 1. A connects with B and C
    await sendConnectionRequest(userA.id, userB.handle, memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    await respondToConnectionRequest(userB.id, connsB.incoming[0].id, 'accept', memDb as any);

    await sendConnectionRequest(userA.id, userC.handle, memDb as any);
    const connsC = await getConnections(userC.id, memDb as any);
    await respondToConnectionRequest(userC.id, connsC.incoming[0].id, 'accept', memDb as any);

    // 2. A creates group and invites B and C
    const group = await createGroup(userA.id, 'Goa Trip 2026', memDb as any);
    await inviteMembersToGroup(userA.id, group.id, [userB.id, userC.id], memDb as any);
    await respondToGroupInvite(userB.id, group.id, 'accept', memDb as any);
    await respondToGroupInvite(userC.id, group.id, 'accept', memDb as any);

    // 3. Alice pays ₹100.00 (indivisible among 3 -> 10000 paise: 3334, 3333, 3333 paise)
    const splitRes = await createSharedExpenseSplit(userA.id, group.id, {
      totalPaise: 10000,
      participantIds: [userA.id, userB.id, userC.id],
      note: 'Dinner split',
    }, memDb as any);

    expect(splitRes.entries.length).toBe(2); // Loans for Bob and Charlie
    const totalLoanPaise = splitRes.entries.reduce((s, e) => s + e.paise, 0);
    expect(totalLoanPaise).toBe(6666); // 3333 + 3333 (Alice paid her own 3334)

    // Verify Nets
    let details = await getGroupDetails(userA.id, group.id, memDb as any);
    expect(details!.nets![userA.id]).toBe(6666);
    expect(details!.nets![userB.id]).toBe(-3333);
    expect(details!.nets![userC.id]).toBe(-3333);

    // 4. Bob records payment to Alice of ₹33.33 (3333 paise) -> pending
    const paymentB = await recordPayment(userB.id, group.id, {
      payeeId: userA.id,
      paise: 3333,
    }, memDb as any);
    expect(paymentB.status).toBe('pending');

    // Nets remain unchanged while pending
    details = await getGroupDetails(userB.id, group.id, memDb as any);
    expect(details!.nets![userB.id]).toBe(-3333);

    // Alice confirms payment
    await confirmOrRejectPayment(userA.id, paymentB.id, 'confirm', memDb as any);

    // Now Bob has net balance 0 and can leave
    details = await getGroupDetails(userB.id, group.id, memDb as any);
    expect(details!.nets![userB.id]).toBe(0);

    const leaveRes = await leaveGroup(userB.id, group.id, memDb as any);
    expect(leaveRes.success).toBe(true);

    // Charlie settles his debt to Alice
    const paymentC = await recordPayment(userC.id, group.id, {
      payeeId: userA.id,
      paise: 3333,
    }, memDb as any);
    await confirmOrRejectPayment(userA.id, paymentC.id, 'confirm', memDb as any);

    details = await getGroupDetails(userA.id, group.id, memDb as any);
    expect(details!.nets![userA.id]).toBe(0);
    expect(details!.nets![userC.id]).toBe(0);
    expect(details!.plan?.length).toBe(0);
  });
});
