import { db, AppDb } from '../client';
import { transactions } from '../schema';
import { eq, desc, and } from 'drizzle-orm';

export async function getUserTransactions(userId: string, targetDb: AppDb = db) {
  return targetDb
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.date));
}

export async function addUserTransaction(
  userId: string,
  data: {
    amount: number;
    description: string;
    category: string;
    type: 'income' | 'expense';
    date?: string;
  },
  targetDb: AppDb = db
) {
  const [row] = await targetDb
    .insert(transactions)
    .values({
      userId,
      amount: data.amount,
      description: data.description,
      category: data.category,
      type: data.type,
      ...(data.date ? { date: data.date } : {}),
    })
    .returning();
  return row;
}

export async function deleteUserTransaction(userId: string, id: number, targetDb: AppDb = db): Promise<boolean> {
  const result = await targetDb
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning();
  return result.length > 0;
}
