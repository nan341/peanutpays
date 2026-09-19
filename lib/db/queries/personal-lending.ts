import { db, AppDb } from '../client';
import { friends, lendingEntries } from '../schema';
import { eq, and, sql } from 'drizzle-orm';

export async function getPersonalFriendsAndEntries(userId: string, targetDb: AppDb = db) {
  const userFriends = await targetDb
    .select()
    .from(friends)
    .where(eq(friends.userId, userId));

  const userEntries = await targetDb
    .select()
    .from(lendingEntries)
    .where(and(eq(lendingEntries.userId, userId), eq(lendingEntries.settled, false)));

  return userFriends.map((f) => {
    const fEntries = userEntries.filter((e) => e.friendId === f.id);
    const lentTotal = fEntries
      .filter((e) => e.direction === 'lent')
      .reduce((s, e) => s + e.amount, 0);
    const borrowedTotal = fEntries
      .filter((e) => e.direction === 'borrowed')
      .reduce((s, e) => s + e.amount, 0);
    const netBalance = lentTotal - borrowedTotal;
    return {
      ...f,
      netBalance,
      entries: fEntries,
    };
  });
}

export async function findOrCreateFriend(userId: string, rawName: string, targetDb: AppDb = db) {
  const cleanedName = rawName.trim().replace(/\s+/g, ' ');
  if (!cleanedName || cleanedName.length > 40) {
    throw new Error('Invalid friend name');
  }

  const found = await targetDb
    .select()
    .from(friends)
    .where(and(eq(friends.userId, userId), sql`lower(${friends.name}) = lower(${cleanedName})`));

  if (found.length > 0) {
    return found[0];
  }

  const [created] = await targetDb
    .insert(friends)
    .values({
      userId,
      name: cleanedName,
    })
    .returning();

  return created;
}

export async function addPersonalLendingEntry(
  userId: string,
  data: {
    friendName: string;
    amount: number;
    direction: 'lent' | 'borrowed';
    note?: string;
  },
  targetDb: AppDb = db
) {
  const friend = await findOrCreateFriend(userId, data.friendName, targetDb);
  const [entry] = await targetDb
    .insert(lendingEntries)
    .values({
      userId,
      friendId: friend.id,
      amount: data.amount,
      direction: data.direction,
      note: data.note ? data.note.trim().slice(0, 100) : null,
    })
    .returning();

  return entry;
}

export async function settlePersonalLendingEntry(
  userId: string,
  entryId: number,
  targetDb: AppDb = db
): Promise<boolean> {
  const updated = await targetDb
    .update(lendingEntries)
    .set({ settled: true })
    .where(and(eq(lendingEntries.id, entryId), eq(lendingEntries.userId, userId)))
    .returning();

  return updated.length > 0;
}

export async function deletePersonalLendingEntry(
  userId: string,
  entryId: number,
  targetDb: AppDb = db
): Promise<boolean> {
  const deleted = await targetDb
    .delete(lendingEntries)
    .where(and(eq(lendingEntries.id, entryId), eq(lendingEntries.userId, userId)))
    .returning();

  return deleted.length > 0;
}
