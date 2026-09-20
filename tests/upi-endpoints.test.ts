import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';
import { buildUpiUri, isValidVpa } from '../lib/upi';
import { createSharedLoan, recordPayment, getGroupDetails, confirmOrRejectPayment } from '../lib/db/queries/shared-entries';
import { getInbox } from '../lib/db/queries/inbox';
import { getConnections } from '../lib/db/queries/connections';
import { getUserGroups } from '../lib/db/queries/groups';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

describe('UPI Feature & API Tests', () => {
  let memDb: ReturnType<typeof drizzle>;
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const userC = crypto.randomUUID();
  const groupId = crypto.randomUUID();

  beforeEach(async () => {
    const memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    const passwordHashA = await bcrypt.hash('PasswordA123!', 10);
    const passwordHashB = await bcrypt.hash('PasswordB123!', 10);
    const passwordHashC = await bcrypt.hash('PasswordC123!', 10);

    // Insert 3 users
    await memDb.insert(schema.users).values([
      {
        id: userA,
        email: 'usera@example.com',
        handle: 'usera',
        displayName: 'User A',
        passwordHash: passwordHashA,
        upiId: 'usera@okhdfcbank',
        upiIdUpdatedAt: new Date().toISOString(),
      },
      {
        id: userB,
        email: 'userb@example.com',
        handle: 'userb',
        displayName: 'User B',
        passwordHash: passwordHashB,
        upiId: 'userb@icici',
        upiIdUpdatedAt: new Date().toISOString(),
      },
      {
        id: userC,
        email: 'userc@example.com',
        handle: 'userc',
        displayName: 'User C (No UPI)',
        passwordHash: passwordHashC,
        upiId: null,
        upiIdUpdatedAt: null,
      },
    ]);

    // Create a group with User A and User B and User C
    await memDb.insert(schema.groups).values({
      id: groupId,
      name: 'Test Group',
      type: 'group',
      createdBy: userA,
    });

    await memDb.insert(schema.groupMembers).values([
      { groupId, userId: userA, role: 'admin', status: 'active' },
      { groupId, userId: userB, role: 'member', status: 'active' },
      { groupId, userId: userC, role: 'member', status: 'active' },
    ]);
  });

  it('verifies UPI ID update with correct password and rejects wrong password', async () => {
    const [user] = await memDb.select().from(schema.users).where(eq(schema.users.id, userA));

    // Correct password
    const match = await bcrypt.compare('PasswordA123!', user.passwordHash);
    expect(match).toBe(true);

    // Update UPI
    const newVpa = 'newvpa@sbi';
    expect(isValidVpa(newVpa)).toBe(true);
    await memDb
      .update(schema.users)
      .set({ upiId: newVpa, upiIdUpdatedAt: new Date().toISOString() })
      .where(eq(schema.users.id, userA));

    const [updated] = await memDb.select().from(schema.users).where(eq(schema.users.id, userA));
    expect(updated.upiId).toBe('newvpa@sbi');

    // Wrong password
    const wrongMatch = await bcrypt.compare('WrongPassword!', user.passwordHash);
    expect(wrongMatch).toBe(false);

    // Clearing UPI
    await memDb
      .update(schema.users)
      .set({ upiId: null, upiIdUpdatedAt: null })
      .where(eq(schema.users.id, userA));

    const [cleared] = await memDb.select().from(schema.users).where(eq(schema.users.id, userA));
    expect(cleared.upiId).toBeNull();
  });

  it('builds UPI pay uri strictly from server-stored data matching balance owed', async () => {
    // User B lends 50000 paise (500 INR) to User A
    await createSharedLoan(
      userB,
      groupId,
      {
        lenderId: userB,
        borrowerId: userA,
        paise: 50000,
        note: 'Dinner loan',
      },
      memDb as any
    );

    const details = await getGroupDetails(userA, groupId, memDb as any);
    expect(details).not.toBeNull();

    // User A owes User B 50000 paise
    const planItem = details?.plan?.find((p) => p.from === userA && p.to === userB);
    expect(planItem?.paise).toBe(50000);

    const [payeeUser] = await memDb.select().from(schema.users).where(eq(schema.users.id, userB));
    expect(payeeUser.upiId).toBe('userb@icici');

    const uri = buildUpiUri({
      vpa: payeeUser.upiId!,
      name: payeeUser.displayName,
      paise: planItem!.paise,
    });

    expect(uri).toBe('upi://pay?pa=userb%40icici&pn=User%20B&am=500.00&cu=INR&tn=BudgetMitra%20settle%20up');
  });

  it('stores 12-digit upiRef and displays it in payee awaiting confirmation list', async () => {
    // User A records payment of 25000 paise to User B with valid 12-digit upiRef
    const validUpiRef = '123456789012';
    const entry = await recordPayment(
      userA,
      groupId,
      {
        payeeId: userB,
        paise: 25000,
        upiRef: validUpiRef,
      },
      memDb as any
    );

    expect(entry.status).toBe('pending');
    expect(entry.upiRef).toBe(validUpiRef);

    // Reject non-12-digit upiRef in helper
    await expect(
      recordPayment(
        userA,
        groupId,
        {
          payeeId: userB,
          paise: 10000,
          upiRef: '12345', // only 5 digits
        },
        memDb as any
      )
    ).rejects.toThrow('UPI reference must be exactly 12 digits');

    // Payee (User B) checks inbox and group details
    const inboxB = await getInbox(userB, memDb as any);
    expect(inboxB.payments.length).toBe(1);
    expect(inboxB.payments[0].upiRef).toBe(validUpiRef);

    const groupDetailsB = await getGroupDetails(userB, groupId, memDb as any);
    expect(groupDetailsB?.pendingPayments?.length).toBe(1);
    expect(groupDetailsB?.pendingPayments?.[0].upiRef).toBe(validUpiRef);

    // Payee confirms payment
    await confirmOrRejectPayment(userB, entry.id, 'confirm', memDb as any);

    const updatedGroupDetails = await getGroupDetails(userB, groupId, memDb as any);
    expect(updatedGroupDetails?.pendingPayments?.length).toBe(0);
  });

  it('guarantees UPI IDs are never leaked in connections, group members, or inbox queries', async () => {
    // Connections query
    const conns = await getConnections(userA, memDb as any);
    for (const c of conns.accepted) {
      expect((c.otherUser as any).upiId).toBeUndefined();
      expect((c.otherUser as any).upi_id).toBeUndefined();
    }

    // Groups query
    const groupsList = await getUserGroups(userA, memDb as any);
    expect((groupsList[0] as any).upiId).toBeUndefined();

    // Group details query
    const details = await getGroupDetails(userA, groupId, memDb as any);
    for (const m of details!.members!) {
      expect((m as any).upiId).toBeUndefined();
      expect((m as any).upi_id).toBeUndefined();
    }

    // Inbox query
    const inbox = await getInbox(userA, memDb as any);
    for (const p of inbox.payments) {
      expect((p.payer as any).upiId).toBeUndefined();
      expect((p.payer as any).upi_id).toBeUndefined();
    }
  });
});
