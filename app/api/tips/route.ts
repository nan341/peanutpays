import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { ensureTablesExist } from "@/lib/db/init";
import { transactions } from "@/lib/db/schema";
import { gte } from "drizzle-orm";
import { generateSavingTips } from "@/lib/ai/groq";
import { fallbackTips } from "@/lib/ai/fallback";

export async function GET() {
  try {
    await ensureTablesExist();

    // Get current month's expenses
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const monthlyTxns = await db
      .select()
      .from(transactions)
      .where(gte(transactions.date, monthStart));

    const expenses = monthlyTxns.filter((t) => t.type === "expense");
    const totalSpend = expenses.reduce((s, t) => s + t.amount, 0);

    // Build category breakdown
    const breakdown: Record<string, number> = {};
    for (const t of expenses) {
      breakdown[t.category] = (breakdown[t.category] ?? 0) + t.amount;
    }

    const topCategory =
      Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? undefined;

    const summary = { totalSpend, topCategory, breakdown };

    let tips: string[];
    try {
      tips = await generateSavingTips(summary);
    } catch {
      tips = fallbackTips({ topCategory });
    }

    return NextResponse.json({ tips, summary });
  } catch (err) {
    console.error("[GET /api/tips]", err);
    return NextResponse.json(
      { tips: fallbackTips({}), summary: {} },
      { status: 200 }
    );
  }
}
