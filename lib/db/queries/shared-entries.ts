import { db, AppDb } from '../client';
import { groups, groupMembers, sharedEntries, users } from '../schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { computeNets, computePairwise, simplifyDebts, splitEqually, SettleEntry } from '../../settle';
import crypto from 'crypto';

export async function getGroupDetails(userId: string, groupId: string, targetDb: AppDb = db) {
  const [group] = await targetDb.select().from(groups).where(eq(groups.id, groupId));
  if (!group) return null;

  const [myMembership] = await targetDb
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

  if (!myMembership) return null;

  if (myMembership.status === 'invited') {
    const [creator] = await targetDb
      .select({ id: users.id, displayName: users.displayName, handle: users.handle })
      .from(users)
      .where(eq(users.id, group.createdBy));

    return {
      group,
      myMembership,
      inviter: creator,
    };
  }

  // Active member: fetch all members, entries, and calculate settlement balances
  const members = await targetDb
    .select({
      userId: groupMembers.userId,
      role: groupMembers.role,
      status: groupMembers.status,
      joinedAt: groupMembers.joinedAt,
      displayName: users.displayName,
      handle: users.handle,
      email: users.email,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  const allEntries = await targetDb
    .select({
      id: sharedEntries.id,
      groupId: sharedEntries.groupId,
      lenderId: sharedEntries.lenderId,
      borrowerId: sharedEntries.borrowerId,
      paise: sharedEntries.paise,
      kind: sharedEntries.kind,
      status: sharedEntries.status,
      note: sharedEntries.note,
      batchId: sharedEntries.batchId,
      createdBy: sharedEntries.createdBy,
      createdAt: sharedEntries.createdAt,
      lenderName: sql<string>`(SELECT display_name FROM users WHERE id = ${sharedEntries.lenderId})`,
      borrowerName: sql<string>`(SELECT display_name FROM users WHERE id = ${sharedEntries.borrowerId})`,
      creatorName: sql<string>`(SELECT display_name FROM users WHERE id = ${sharedEntries.createdBy})`,
    })
    .from(sharedEntries)
    .where(eq(sharedEntries.groupId, groupId))
    .orderBy(sql`${sharedEntries.createdAt} DESC`);

  const confirmedEntries = allEntries.filter((e) => e.status === 'confirmed');
  const pendingPayments = allEntries.filter((e) => e.status === 'pending');

  const settleEntries: SettleEntry[] = confirmedEntries.map((e) => ({
    lenderId: e.lenderId,
    borrowerId: e.borrowerId,
    paise: e.paise,
  }));

  const nets = computeNets(settleEntries);
  // Ensure all active members have an entry in nets (even if 0)
  for (const m of members) {
    if (m.status === 'active' && nets[m.userId] === undefined) {
      nets[m.userId] = 0;
    }
  }

  const pairwise = computePairwise(settleEntries);
  const plan = simplifyDebts(nets);

  return {
    group,
    myMembership,
    members,
    entries: confirmedEntries,
    pendingPayments,
    nets,
    pairwise,
    plan,
  };
}

export async function createSharedLoan(
  creatorId: string,
  groupId: string,
  data: {
    lenderId: string;
    borrowerId: string;
    paise: number;
    note?: string;
  },
  targetDb: AppDb = db
) {
  if (data.paise <= 0 || !Number.isInteger(data.paise)) {
    throw new Error('Invalid amount in paise');
  }
  if (data.lenderId === data.borrowerId) {
    throw new Error('Lender and borrower must be different');
  }
  if (creatorId !== data.lenderId && creatorId !== data.borrowerId) {
    throw new Error('You can only record debts involving yourself');
  }

  // Ensure both are active members
  const activeMembers = await targetDb
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.status, 'active'),
        or(eq(groupMembers.userId, data.lenderId), eq(groupMembers.userId, data.borrowerId))
      )
    );

  if (activeMembers.length < 2) {
    throw new Error('Both parties must be active members of the group');
  }

  const [entry] = await targetDb
    .insert(sharedEntries)
    .values({
      id: crypto.randomUUID(),
      groupId,
      lenderId: data.lenderId,
      borrowerId: data.borrowerId,
      paise: data.paise,
      kind: 'loan',
      status: 'confirmed',
      note: data.note ? data.note.trim().slice(0, 100) : null,
      createdBy: creatorId,
    })
    .returning();

  return entry;
}

export async function createSharedExpenseSplit(
  creatorId: string,
  groupId: string,
  data: {
    totalPaise: number;
    participantIds: string[];
    note?: string;
  },
  targetDb: AppDb = db
) {
  if (data.totalPaise <= 0 || !Number.isInteger(data.totalPaise)) {
    throw new Error('Invalid total in paise');
  }
  if (!data.participantIds || data.participantIds.length === 0) {
    throw new Error('At least one participant required');
  }

  const uniqueParticipants = Array.from(new Set(data.participantIds));

  // Check group type (must be group)
  const [group] = await targetDb.select().from(groups).where(eq(groups.id, groupId));
  if (!group || group.type !== 'group') {
    throw new Error('Expense splitting is only allowed in multi-member groups');
  }

  // Verify all participants are active members
  const activeMembers = await targetDb
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, 'active')));

  const activeSet = new Set(activeMembers.map((m) => m.userId));
  if (!activeSet.has(creatorId)) {
    throw new Error('You must be an active member to record an expense');
  }

  for (const id of uniqueParticipants) {
    if (!activeSet.has(id)) {
      throw new Error(`Participant ${id} is not an active member of this group`);
    }
  }

  const parts = splitEqually(data.totalPaise, uniqueParticipants);
  const batchId = crypto.randomUUID();
  const note = data.note ? data.note.trim().slice(0, 100) : null;

  const insertedEntries = [];

  for (const borrowerId of uniqueParticipants) {
    if (borrowerId === creatorId) continue;
    const borrowerPaise = parts[borrowerId];
    if (borrowerPaise > 0) {
      const [entry] = await targetDb
        .insert(sharedEntries)
        .values({
          id: crypto.randomUUID(),
          groupId,
          lenderId: creatorId,
          borrowerId,
          paise: borrowerPaise,
          kind: 'loan',
          status: 'confirmed',
          note,
          batchId,
          createdBy: creatorId,
        })
        .returning();
      insertedEntries.push(entry);
    }
  }

  return { batchId, entries: insertedEntries };
}

export async function createSharedCustomSplit(
  creatorId: string,
  groupId: string,
  data: {
    shares: { userId: string; paise: number }[];
    note?: string;
  },
  targetDb: AppDb = db
) {
  if (!data.shares || data.shares.length === 0) {
    throw new Error('At least one share required');
  }

  const [group] = await targetDb.select().from(groups).where(eq(groups.id, groupId));
  if (!group) {
    throw new Error('Group not found');
  }

  const activeMembers = await targetDb
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, 'active')));

  const activeSet = new Set(activeMembers.map((m) => m.userId));
  if (!activeSet.has(creatorId)) {
    throw new Error('You must be an active member to record an expense');
  }

  for (const s of data.shares) {
    if (!activeSet.has(s.userId)) {
      throw new Error(`User ${s.userId} is not an active member of this group`);
    }
    if (s.paise < 0 || !Number.isInteger(s.paise)) {
      throw new Error('Share amount must be a non-negative integer');
    }
  }

  const batchId = crypto.randomUUID();
  const note = data.note ? data.note.trim().slice(0, 100) : null;
  const insertedEntries = [];

  for (const share of data.shares) {
    if (share.userId === creatorId) continue;
    if (share.paise > 0) {
      const [entry] = await targetDb
        .insert(sharedEntries)
        .values({
          id: crypto.randomUUID(),
          groupId,
          lenderId: creatorId,
          borrowerId: share.userId,
          paise: share.paise,
          kind: 'loan',
          status: 'confirmed',
          note,
          batchId,
          createdBy: creatorId,
        })
        .returning();
      insertedEntries.push(entry);
    }
  }

  return { batchId, entries: insertedEntries };
}

export async function recordPayment(
  creatorId: string,
  groupId: string,
  data: {
    payeeId: string;
    paise: number;
    note?: string;
  },
  targetDb: AppDb = db
) {
  if (data.paise <= 0 || !Number.isInteger(data.paise)) {
    throw new Error('Invalid payment amount');
  }
  if (creatorId === data.payeeId) {
    throw new Error('Cannot record payment to yourself');
  }

  // Verify active membership of both
  const activeMembers = await targetDb
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.status, 'active'),
        or(eq(groupMembers.userId, creatorId), eq(groupMembers.userId, data.payeeId))
      )
    );

  if (activeMembers.length < 2) {
    throw new Error('Both members must be active in the group');
  }

  // If creator is the payer: status is 'pending' until payee confirms.
  // In net calculation: payer is lender (+paise), payee is borrower (-paise)
  const status = 'pending';

  const [entry] = await targetDb
    .insert(sharedEntries)
    .values({
      id: crypto.randomUUID(),
      groupId,
      lenderId: creatorId,
      borrowerId: data.payeeId,
      paise: data.paise,
      kind: 'payment',
      status,
      note: data.note ? data.note.trim().slice(0, 100) : null,
      createdBy: creatorId,
    })
    .returning();

  return entry;
}

export async function confirmOrRejectPayment(
  userId: string,
  entryId: string,
  action: 'confirm' | 'reject',
  targetDb: AppDb = db
): Promise<boolean> {
  const [entry] = await targetDb
    .select()
    .from(sharedEntries)
    .where(
      and(
        eq(sharedEntries.id, entryId),
        eq(sharedEntries.kind, 'payment'),
        eq(sharedEntries.status, 'pending')
      )
    );

  if (!entry) return false;

  // Only the payee (borrower_id) can confirm or reject
  if (entry.borrowerId !== userId) {
    return false;
  }

  if (action === 'reject') {
    await targetDb.delete(sharedEntries).where(eq(sharedEntries.id, entryId));
    return true;
  }

  await targetDb
    .update(sharedEntries)
    .set({ status: 'confirmed' })
    .where(eq(sharedEntries.id, entryId));

  return true;
}

export async function deleteSharedEntry(
  userId: string,
  entryId: string,
  targetDb: AppDb = db
): Promise<boolean> {
  const [entry] = await targetDb.select().from(sharedEntries).where(eq(sharedEntries.id, entryId));
  if (!entry) return false;

  // Check permissions: creator OR group admin
  const isCreator = entry.createdBy === userId;

  const [membership] = await targetDb
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, entry.groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, 'active')
      )
    );

  const isAdmin = membership?.role === 'admin';

  if (!isCreator && !isAdmin) {
    return false;
  }

  // If entry belongs to a batch, delete the entire batch
  if (entry.batchId) {
    await targetDb
      .delete(sharedEntries)
      .where(
        and(eq(sharedEntries.groupId, entry.groupId), eq(sharedEntries.batchId, entry.batchId))
      );
  } else {
    await targetDb.delete(sharedEntries).where(eq(sharedEntries.id, entryId));
  }

  return true;
}
