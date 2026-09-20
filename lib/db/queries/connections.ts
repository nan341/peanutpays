import { db, AppDb } from '../client';
import { connections, groups, groupMembers, users } from '../schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { getGroupDetails } from './shared-entries';
import crypto from 'crypto';

export async function sendConnectionRequest(
  requesterId: string,
  rawHandle: string,
  targetDb: AppDb = db
): Promise<{ success: boolean; message: string }> {
  const genericResponse = {
    success: true,
    message: 'If this handle exists, a connection request has been sent.',
  };

  const handle = rawHandle.trim().replace(/^@+/, '').toLowerCase();
  if (!handle || handle.length < 3 || handle.length > 20) {
    return genericResponse;
  }

  // Exact match only
  const targetUsers = await targetDb
    .select({ id: users.id, handle: users.handle })
    .from(users)
    .where(eq(users.handle, handle));

  if (targetUsers.length === 0) {
    return genericResponse;
  }

  const addresseeId = targetUsers[0].id;
  if (addresseeId === requesterId) {
    return genericResponse;
  }

  // Check if connection already exists in either direction
  const existing = await targetDb
    .select()
    .from(connections)
    .where(
      or(
        and(eq(connections.requesterId, requesterId), eq(connections.addresseeId, addresseeId)),
        and(eq(connections.requesterId, addresseeId), eq(connections.addresseeId, requesterId))
      )
    );

  if (existing.length > 0) {
    return genericResponse;
  }

  await targetDb.insert(connections).values({
    id: crypto.randomUUID(),
    requesterId,
    addresseeId,
    status: 'pending',
  });

  return genericResponse;
}

export async function getConnections(userId: string, targetDb: AppDb = db) {
  // Accepted connections
  const allAccepted = await targetDb
    .select()
    .from(connections)
    .where(
      and(
        or(eq(connections.requesterId, userId), eq(connections.addresseeId, userId)),
        eq(connections.status, 'accepted')
      )
    );

  // Incoming pending
  const incoming = await targetDb
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

  // Outgoing pending
  const outgoing = await targetDb
    .select({
      id: connections.id,
      createdAt: connections.createdAt,
      addressee: {
        id: users.id,
        displayName: users.displayName,
        handle: users.handle,
      },
    })
    .from(connections)
    .innerJoin(users, eq(connections.addresseeId, users.id))
    .where(and(eq(connections.requesterId, userId), eq(connections.status, 'pending')));

  // For accepted connections, attach other user profile, direct groupId, and net balance
  const acceptedList = [];
  for (const conn of allAccepted) {
    const otherUserId = conn.requesterId === userId ? conn.addresseeId : conn.requesterId;
    const [otherUser] = await targetDb
      .select({
        id: users.id,
        displayName: users.displayName,
        handle: users.handle,
      })
      .from(users)
      .where(eq(users.id, otherUserId));

    if (!otherUser) continue;

    // Find direct group between them
    const directGroupRows = await targetDb.all<{ group_id: string }>(sql`
      SELECT gm1.group_id
      FROM group_members gm1
      INNER JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      INNER JOIN groups g ON g.id = gm1.group_id
      WHERE gm1.user_id = ${userId}
        AND gm2.user_id = ${otherUserId}
        AND g.type = 'direct'
      LIMIT 1
    `);

    let directGroupId: string | null = null;
    let netBalancePaise = 0;

    if (directGroupRows.length > 0) {
      directGroupId = directGroupRows[0].group_id;
      const details = await getGroupDetails(userId, directGroupId, targetDb);
      if (details?.nets) {
        netBalancePaise = details.nets[userId] ?? 0;
      }
    }

    acceptedList.push({
      id: conn.id,
      createdAt: conn.createdAt,
      otherUser,
      directGroupId,
      netBalancePaise,
    });
  }

  return {
    accepted: acceptedList,
    incoming,
    outgoing,
  };
}

export async function respondToConnectionRequest(
  userId: string,
  connectionId: string,
  action: 'accept' | 'decline',
  targetDb: AppDb = db
): Promise<boolean> {
  const [conn] = await targetDb
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.addresseeId, userId),
        eq(connections.status, 'pending')
      )
    );

  if (!conn) return false;

  if (action === 'decline') {
    await targetDb.delete(connections).where(eq(connections.id, connectionId));
    return true;
  }

  // Accept
  await targetDb
    .update(connections)
    .set({ status: 'accepted' })
    .where(eq(connections.id, connectionId));

  // Check if a direct group already exists between the two
  const existingGroupRows = await targetDb.all<{ group_id: string }>(sql`
    SELECT gm1.group_id
    FROM group_members gm1
    INNER JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    INNER JOIN groups g ON g.id = gm1.group_id
    WHERE gm1.user_id = ${conn.requesterId}
      AND gm2.user_id = ${conn.addresseeId}
      AND g.type = 'direct'
    LIMIT 1
  `);

  if (existingGroupRows.length === 0) {
    const groupId = crypto.randomUUID();
    await targetDb.insert(groups).values({
      id: groupId,
      name: 'Direct',
      type: 'direct',
      createdBy: conn.requesterId,
    });

    await targetDb.insert(groupMembers).values([
      {
        groupId,
        userId: conn.requesterId,
        role: 'member',
        status: 'active',
      },
      {
        groupId,
        userId: conn.addresseeId,
        role: 'member',
        status: 'active',
      },
    ]);
  }

  return true;
}

export async function removeConnection(
  userId: string,
  connectionId: string,
  targetDb: AppDb = db
): Promise<{ success: boolean; error?: string }> {
  const [conn] = await targetDb
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        or(eq(connections.requesterId, userId), eq(connections.addresseeId, userId))
      )
    );

  if (!conn) {
    return { success: false, error: 'Connection not found' };
  }

  if (conn.status === 'pending') {
    await targetDb.delete(connections).where(eq(connections.id, connectionId));
    return { success: true };
  }

  // For accepted connection, check direct group balance
  const otherUserId = conn.requesterId === userId ? conn.addresseeId : conn.requesterId;
  const directGroupRows = await targetDb.all<{ group_id: string }>(sql`
    SELECT gm1.group_id
    FROM group_members gm1
    INNER JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    INNER JOIN groups g ON g.id = gm1.group_id
    WHERE gm1.user_id = ${userId}
      AND gm2.user_id = ${otherUserId}
      AND g.type = 'direct'
    LIMIT 1
  `);

  if (directGroupRows.length > 0) {
    const groupId = directGroupRows[0].group_id;
    const details = await getGroupDetails(userId, groupId, targetDb);
    const balance = details?.nets?.[userId] ?? 0;
    if (balance !== 0) {
      return { success: false, error: 'Cannot remove connection with an unsettled balance' };
    }
    // Delete direct group and its members
    await targetDb.delete(groups).where(eq(groups.id, groupId));
  }

  await targetDb.delete(connections).where(eq(connections.id, connectionId));
  return { success: true };
}
