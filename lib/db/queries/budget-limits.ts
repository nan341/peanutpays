import { db, AppDb } from '../client';
import { budgetLimits } from '../schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export async function getBudgetLimitsByUser(userId: string, targetDb: AppDb = db) {
  return targetDb
    .select()
    .from(budgetLimits)
    .where(eq(budgetLimits.userId, userId));
}

export async function upsertBudgetLimit(
  userId: string,
  category: string,
  monthlyLimit: number,
  targetDb: AppDb = db
) {
  const existing = await targetDb
    .select()
    .from(budgetLimits)
    .where(and(eq(budgetLimits.userId, userId), eq(budgetLimits.category, category)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await targetDb
      .update(budgetLimits)
      .set({
        monthlyLimit,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(budgetLimits.id, existing[0].id))
      .returning();
    return updated;
  } else {
    const [inserted] = await targetDb
      .insert(budgetLimits)
      .values({
        id: crypto.randomUUID(),
        userId,
        category,
        monthlyLimit,
        updatedAt: new Date().toISOString(),
      })
      .returning();
    return inserted;
  }
}

export async function deleteBudgetLimit(userId: string, category: string, targetDb: AppDb = db) {
  const result = await targetDb
    .delete(budgetLimits)
    .where(and(eq(budgetLimits.userId, userId), eq(budgetLimits.category, category)))
    .returning();
  return result.length > 0;
}
