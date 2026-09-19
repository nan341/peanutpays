import { db, AppDb } from '../client';
import { groups, groupMembers, connections } from '../schema';
import { eq, and, or } from 'drizzle-orm';
import { getGroupDetails } from './shared-entries';
import crypto from 'crypto';

export async function createGroup(
  creatorId: string,
  rawName: string,
  targetDb: AppDb = db
) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name || name.length < 1 || name.length > 40) {
    throw new Error('Group name must be between 1 and 40 characters');
  }

  const groupId = crypto.randomUUID();

  const [group] = await targetDb
    .insert(groups)
    .values({
      id: groupId,
      name,
      type: 'group',
      createdBy: creatorId,
    })
    .returning();

  await targetDb.insert(groupMembers).values({
    groupId,
    userId: creatorId,
    role: 'admin',
    status: 'active',
  });

  return group;
}

export async function getUserGroups(userId: string, targetDb: AppDb = db) {
  const memberships = await targetDb
    .select({
      role: groupMembers.role,
      status: groupMembers.status,
      joinedAt: groupMembers.joinedAt,
      group: {
        id: groups.id,
        name: groups.name,
        type: groups.type,
        createdBy: groups.createdBy,
        createdAt: groups.createdAt,
      },
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId));

  // Only multi-user groups for the groups list
  const multiGroups = memberships.filter((m) => m.group.type === 'group');

  const result = [];
  for (const item of multiGroups) {
    let myNetBalancePaise = 0;
    let memberCount = 0;

    if (item.status === 'active') {
      const details = await getGroupDetails(userId, item.group.id, targetDb);
      if (details?.nets) {
        myNetBalancePaise = details.nets[userId] ?? 0;
      }
      memberCount = details?.members?.length ?? 1;
    }

    result.push({
      ...item,
      myNetBalancePaise,
      memberCount,
    });
  }

  return result;
}

export async function inviteMembersToGroup(
  adminUserId: string,
  groupId: string,
  inviteeUserIds: string[],
  targetDb: AppDb = db
) {
  // Verify admin
  const [membership] = await targetDb
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, adminUserId),
        eq(groupMembers.status, 'active')
      )
    );

  if (!membership || membership.role !== 'admin') {
    throw new Error('Only active group admins can invite new members');
  }

  // Get admin accepted connections
  const userConns = await targetDb
    .select()
    .from(connections)
    .where(
      and(
        or(eq(connections.requesterId, adminUserId), eq(connections.addresseeId, adminUserId)),
        eq(connections.status, 'accepted')
      )
    );

  const acceptedFriendIds = new Set<string>();
  for (const c of userConns) {
    acceptedFriendIds.add(c.requesterId === adminUserId ? c.addresseeId : c.requesterId);
  }

  const invited = [];
  for (const inviteeId of inviteeUserIds) {
    if (!acceptedFriendIds.has(inviteeId)) {
      throw new Error(`You can only invite accepted connections (user ${inviteeId} is not connected)`);
    }

    // Check if already in group
    const existing = await targetDb
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, inviteeId)));

    if (existing.length === 0) {
      const [res] = await targetDb
        .insert(groupMembers)
        .values({
          groupId,
          userId: inviteeId,
          role: 'member',
          status: 'invited',
        })
        .returning();
      invited.push(res);
    }
  }

  return invited;
}

export async function respondToGroupInvite(
  userId: string,
  groupId: string,
  action: 'accept' | 'decline',
  targetDb: AppDb = db
): Promise<boolean> {
  const [membership] = await targetDb
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, 'invited')
      )
    );

  if (!membership) return false;

  if (action === 'decline') {
    await targetDb
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    return true;
  }

  await targetDb
    .update(groupMembers)
    .set({ status: 'active' })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

  return true;
}

export async function promoteMemberToAdmin(
  adminUserId: string,
  groupId: string,
  targetUserId: string,
  targetDb: AppDb = db
): Promise<boolean> {
  const [myMembership] = await targetDb
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, adminUserId),
        eq(groupMembers.status, 'active')
      )
    );

  if (!myMembership || myMembership.role !== 'admin') {
    throw new Error('Only active group admins can promote members');
  }

  const [targetMembership] = await targetDb
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, targetUserId),
        eq(groupMembers.status, 'active')
      )
    );

  if (!targetMembership) {
    throw new Error('Target user is not an active member of this group');
  }

  await targetDb
    .update(groupMembers)
    .set({ role: 'admin' })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));

  return true;
}

export async function leaveGroup(
  userId: string,
  groupId: string,
  targetDb: AppDb = db
): Promise<{ success: boolean; error?: string }> {
  const details = await getGroupDetails(userId, groupId, targetDb);
  if (!details || details.myMembership.status !== 'active') {
    return { success: false, error: 'Group not found or you are not an active member' };
  }

  const netBalance = details.nets?.[userId] ?? 0;
  if (netBalance !== 0) {
    return {
      success: false,
      error: `Cannot leave group with an unsettled balance of ₹${(Math.abs(netBalance) / 100).toFixed(2)}`,
    };
  }

  const activeMembers = details.members?.filter((m) => m.status === 'active') ?? [];
  const isAdmin = details.myMembership.role === 'admin';

  if (isAdmin && activeMembers.length > 1) {
    const otherAdmins = activeMembers.filter((m) => m.userId !== userId && m.role === 'admin');
    if (otherAdmins.length === 0) {
      return {
        success: false,
        error: 'You are the only admin. You must promote another member to admin before leaving.',
      };
    }
  }

  // Remove member
  await targetDb
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

  // If no members remain, delete group
  if (activeMembers.length <= 1) {
    await targetDb.delete(groups).where(eq(groups.id, groupId));
  }

  return { success: true };
}
