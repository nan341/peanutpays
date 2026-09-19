import { db, AppDb } from '../client';
import { transactions, friends, lendingEntries } from '../schema';
import { eq } from 'drizzle-orm';

export async function clearUserData(userId: string, targetDb: AppDb = db) {
  await targetDb.delete(lendingEntries).where(eq(lendingEntries.userId, userId));
  await targetDb.delete(friends).where(eq(friends.userId, userId));
  await targetDb.delete(transactions).where(eq(transactions.userId, userId));
  return { success: true };
}
