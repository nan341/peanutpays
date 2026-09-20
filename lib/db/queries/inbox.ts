import { db, AppDb } from '../client';
import { connections, groups, groupMembers, sharedEntries, users } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getInbox(userId: string, targetDb: AppDb = db) {
  // 1. Pending connection requests
  const pendingConnections = await targetDb
    .select({
      id: connections.id,
      createdAt: connections.createdAt,
      requester: {
        id: users.id,
        displayName: users.displayName,
        handle: users.handle,
      },
    })
    .from(connections)
    .innerJoin(users, eq(connections.requesterId, users.id))
    .where(and(eq(connections.addresseeId, userId), eq(connections.status, 'pending')));

  // 2. Pending group invitations
  const pendingGroupInvites = await targetDb
    .select({
      groupId: groupMembers.groupId,
      joinedAt: groupMembers.joinedAt,
      group: {
        id: groups.id,
        name: groups.name,
      },
      inviter: {
        id: users.id,
        displayName: users.displayName,
        handle: users.handle,
      },
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .innerJoin(users, eq(groups.createdBy, users.id))
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, 'invited')));

  // 3. Pending payments awaiting my confirmation (I am the payee/borrower)
  const pendingPayments = await targetDb
    .select({
      id: sharedEntries.id,
      groupId: sharedEntries.groupId,
      paise: sharedEntries.paise,
      note: sharedEntries.note,
      upiRef: sharedEntries.upiRef,
      createdAt: sharedEntries.createdAt,
      groupName: groups.name,
      payer: {
        id: users.id,
        displayName: users.displayName,
        handle: users.handle,
      },
    })
    .from(sharedEntries)
    .innerJoin(users, eq(sharedEntries.lenderId, users.id))
    .innerJoin(groups, eq(sharedEntries.groupId, groups.id))
    .where(
      and(
        eq(sharedEntries.borrowerId, userId),
        eq(sharedEntries.kind, 'payment'),
        eq(sharedEntries.status, 'pending')
      )
    );

  const totalCount =
    pendingConnections.length + pendingGroupInvites.length + pendingPayments.length;

  return {
    totalCount,
    connections: pendingConnections,
    groupInvites: pendingGroupInvites,
    payments: pendingPayments,
  };
}
