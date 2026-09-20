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
  createSharedLoan,
  createSharedExpenseSplit,
  createSharedCustomSplit,
  recordPayment,
  confirmOrRejectPayment,
} from '../lib/db/queries/shared-entries';
import { clearUserData } from '../lib/db/queries/user-data';
import bcrypt from 'bcryptjs';

describe('Phase 4 & 5: Connections, Direct Ledgers, and Groups', () => {
  let memDb: ReturnType<typeof drizzle>;
  const userA = { id: 'uA', email: 'a@ex.com', handle: 'usera', displayName: 'User A' };
  const userB = { id: 'uB', email: 'b@ex.com', handle: 'userb', displayName: 'User B' };
  const userC = { id: 'uC', email: 'c@ex.com', handle: 'userc', displayName: 'User C' };

  beforeEach(async () => {
    const memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    const hash = await bcrypt.hash('pass1234', 12);
    await memDb.insert(schema.users).values([
      { ...userA, passwordHash: hash },
      { ...userB, passwordHash: hash },
      { ...userC, passwordHash: hash },
    ]);
  });

  it('handle lookup responses are identical for existing, unknown, own, and already-connected handles', async () => {
    // Existing handle
    const res1 = await sendConnectionRequest(userA.id, 'userb', memDb as any);
    // Unknown handle
    const res2 = await sendConnectionRequest(userA.id, 'unknown_handle_99', memDb as any);
    // Own handle
    const res3 = await sendConnectionRequest(userA.id, 'usera', memDb as any);
    // Already connected / pending
    const res4 = await sendConnectionRequest(userA.id, 'userb', memDb as any);

    expect(res1).toEqual(res2);
    expect(res2).toEqual(res3);
    expect(res3).toEqual(res4);
    expect(res1.message).toBe('If this handle exists, a connection request has been sent.');
  });

  it('normalizes handles with leading @ and whitespace when sending connection requests', async () => {
    // Send with @ and spaces
    await sendConnectionRequest(userA.id, '  @userb  ', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    expect(connsB.incoming.length).toBe(1);
    expect(connsB.incoming[0].requester.handle).toBe('usera');
  });

  it('accepting a connection creates a direct group between two users', async () => {
    await sendConnectionRequest(userA.id, 'userb', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    expect(connsB.incoming.length).toBe(1);

    const reqId = connsB.incoming[0].id;
    await respondToConnectionRequest(userB.id, reqId, 'accept', memDb as any);

    const connsA = await getConnections(userA.id, memDb as any);
    expect(connsA.accepted.length).toBe(1);
    expect(connsA.accepted[0].directGroupId).toBeDefined();

    // Verify direct group details accessible by both
    const detailsA = await getGroupDetails(userA.id, connsA.accepted[0].directGroupId!, memDb as any);
    expect(detailsA).not.toBeNull();
    expect(detailsA?.group.type).toBe('direct');
  });

  it('non-members get null/404 on group reads', async () => {
    const group = await createGroup(userA.id, 'Trip to Goa', memDb as any);

    // User C is not in group
    const detailsC = await getGroupDetails(userC.id, group.id, memDb as any);
    expect(detailsC).toBeNull();
  });

  it('invited (not active) members are excluded from balances and cannot post', async () => {
    // A and B connect
    await sendConnectionRequest(userA.id, 'userb', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    await respondToConnectionRequest(userB.id, connsB.incoming[0].id, 'accept', memDb as any);

    const group = await createGroup(userA.id, 'Flatmates', memDb as any);
    await inviteMembersToGroup(userA.id, group.id, [userB.id], memDb as any);

    // User B is invited
    const detailsB = await getGroupDetails(userB.id, group.id, memDb as any);
    expect(detailsB?.myMembership?.status).toBe('invited');
    // Invited members cannot see member list or balances
    expect((detailsB as any).members).toBeUndefined();

    // User B tries to post a loan before accepting
    await expect(
      createSharedLoan(userB.id, group.id, {
        lenderId: userB.id,
        borrowerId: userA.id,
        paise: 50000,
      }, memDb as any)
    ).rejects.toThrow();

    // User B accepts invite
    await respondToGroupInvite(userB.id, group.id, 'accept', memDb as any);

    // Now B can post a loan
    const loan = await createSharedLoan(userB.id, group.id, {
      lenderId: userB.id,
      borrowerId: userA.id,
      paise: 50000,
    }, memDb as any);
    expect(loan.id).toBeDefined();
  });

  it('rejects an entry whose creator is neither lender nor borrower', async () => {
    // Connect A with B and C
    await sendConnectionRequest(userA.id, 'userb', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    await respondToConnectionRequest(userB.id, connsB.incoming[0].id, 'accept', memDb as any);

    await sendConnectionRequest(userA.id, 'userc', memDb as any);
    const connsC = await getConnections(userC.id, memDb as any);
    await respondToConnectionRequest(userC.id, connsC.incoming[0].id, 'accept', memDb as any);

    const group = await createGroup(userA.id, 'Dinner Club', memDb as any);
    await inviteMembersToGroup(userA.id, group.id, [userB.id, userC.id], memDb as any);
    await respondToGroupInvite(userB.id, group.id, 'accept', memDb as any);
    await respondToGroupInvite(userC.id, group.id, 'accept', memDb as any);

    // User A tries to record debt between B and C
    await expect(
      createSharedLoan(userA.id, group.id, {
        lenderId: userB.id,
        borrowerId: userC.id,
        paise: 20000,
      }, memDb as any)
    ).rejects.toThrow('You can only record debts involving yourself');
  });

  it('pending payments do not change balances, confirmed ones do', async () => {
    // Setup group with A and B
    await sendConnectionRequest(userA.id, 'userb', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    await respondToConnectionRequest(userB.id, connsB.incoming[0].id, 'accept', memDb as any);

    const group = await createGroup(userA.id, 'Rent Group', memDb as any);
    await inviteMembersToGroup(userA.id, group.id, [userB.id], memDb as any);
    await respondToGroupInvite(userB.id, group.id, 'accept', memDb as any);

    // A pays for B (A lent 1000.00 to B)
    await createSharedLoan(userA.id, group.id, {
      lenderId: userA.id,
      borrowerId: userB.id,
      paise: 100000,
    }, memDb as any);

    let details = await getGroupDetails(userA.id, group.id, memDb as any);
    expect(details!.nets![userA.id]).toBe(100000);
    expect(details!.nets![userB.id]).toBe(-100000);

    // B records a payment of 1000.00 back to A (status pending)
    const payment = await recordPayment(userB.id, group.id, {
      payeeId: userA.id,
      paise: 100000,
    }, memDb as any);
    expect(payment.status).toBe('pending');

    // Net balances should NOT change while payment is pending
    details = await getGroupDetails(userA.id, group.id, memDb as any);
    expect(details!.nets![userA.id]).toBe(100000);
    expect(details!.nets![userB.id]).toBe(-100000);
    expect(details!.pendingPayments!.length).toBe(1);

    // A confirms payment
    await confirmOrRejectPayment(userA.id, payment.id, 'confirm', memDb as any);

    // Net balances now updated to 0
    details = await getGroupDetails(userA.id, group.id, memDb as any);
    expect(details!.nets![userA.id]).toBe(0);
    expect(details!.nets![userB.id]).toBe(0);
    expect(details!.pendingPayments!.length).toBe(0);
  });

  it('leaving a group with a nonzero balance is blocked', async () => {
    await sendConnectionRequest(userA.id, 'userb', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    await respondToConnectionRequest(userB.id, connsB.incoming[0].id, 'accept', memDb as any);

    const group = await createGroup(userA.id, 'Project Team', memDb as any);
    await inviteMembersToGroup(userA.id, group.id, [userB.id], memDb as any);
    await respondToGroupInvite(userB.id, group.id, 'accept', memDb as any);

    // Loan: A lent 500 to B
    await createSharedLoan(userA.id, group.id, {
      lenderId: userA.id,
      borrowerId: userB.id,
      paise: 50000,
    }, memDb as any);

    // B tries to leave
    const leaveResB = await leaveGroup(userB.id, group.id, memDb as any);
    expect(leaveResB.success).toBe(false);
    expect(leaveResB.error).toContain('unsettled balance');

    // Settle balance: B pays A 500 and A confirms
    const payment = await recordPayment(userB.id, group.id, {
      payeeId: userA.id,
      paise: 50000,
    }, memDb as any);
    await confirmOrRejectPayment(userA.id, payment.id, 'confirm', memDb as any);

    // Now B can leave
    const leaveResB2 = await leaveGroup(userB.id, group.id, memDb as any);
    expect(leaveResB2.success).toBe(true);
  });

  it('DELETE /api/data for user A leaves shared ledgers intact', async () => {
    await sendConnectionRequest(userA.id, 'userb', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    await respondToConnectionRequest(userB.id, connsB.incoming[0].id, 'accept', memDb as any);

    const group = await createGroup(userA.id, 'Shared Expenses', memDb as any);
    await inviteMembersToGroup(userA.id, group.id, [userB.id], memDb as any);
    await respondToGroupInvite(userB.id, group.id, 'accept', memDb as any);

    await createSharedLoan(userA.id, group.id, {
      lenderId: userA.id,
      borrowerId: userB.id,
      paise: 30000,
    }, memDb as any);

    // User A clears personal data
    await clearUserData(userA.id, memDb as any);

    // Group ledger remains intact
    const groupDetails = await getGroupDetails(userB.id, group.id, memDb as any);
    expect(groupDetails).not.toBeNull();
    expect(groupDetails!.entries!.length).toBe(1);
    expect(groupDetails!.nets![userB.id]).toBe(-30000);
  });

  it('creates custom receipt itemized splits with uneven per-member amounts in group or direct ledger', async () => {
    await sendConnectionRequest(userA.id, 'userb', memDb as any);
    const connsB = await getConnections(userB.id, memDb as any);
    await respondToConnectionRequest(userB.id, connsB.incoming[0].id, 'accept', memDb as any);

    await sendConnectionRequest(userA.id, 'userc', memDb as any);
    const connsC = await getConnections(userC.id, memDb as any);
    await respondToConnectionRequest(userC.id, connsC.incoming[0].id, 'accept', memDb as any);

    const group = await createGroup(userA.id, 'Dinner Trip', memDb as any);
    await inviteMembersToGroup(userA.id, group.id, [userB.id, userC.id], memDb as any);
    await respondToGroupInvite(userB.id, group.id, 'accept', memDb as any);
    await respondToGroupInvite(userC.id, group.id, 'accept', memDb as any);

    // User A paid total ₹700: A's share = ₹200, B's share = ₹350, C's share = ₹150
    const customSplit = await createSharedCustomSplit(
      userA.id,
      group.id,
      {
        shares: [
          { userId: userA.id, paise: 20000 },
          { userId: userB.id, paise: 35000 },
          { userId: userC.id, paise: 15000 },
        ],
        note: 'Dinner Receipt OCR Split',
      },
      memDb as any
    );

    expect(customSplit.batchId).toBeDefined();
    expect(customSplit.entries.length).toBe(2); // Loans created for B and C (A is lender)

    const details = await getGroupDetails(userA.id, group.id, memDb as any);
    expect(details?.nets[userA.id]).toBe(50000); // A is owed ₹500
    expect(details?.nets[userB.id]).toBe(-35000); // B owes ₹350
    expect(details?.nets[userC.id]).toBe(-15000); // C owes ₹150
  });
});
