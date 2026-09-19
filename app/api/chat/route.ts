import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { ensureTablesExist } from '@/lib/db/init';
import { transactions } from '@/lib/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { askBudgetQuestion } from '@/lib/ai/groq';
import { fallbackChatAnswer } from '@/lib/ai/fallback';
import { requireUser } from '@/lib/auth-helper';
import { handleRuleBasedChatQuery } from '@/lib/chat/rule-based-handler';

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 400 });
    }

    await ensureTablesExist();
    const { question } = await req.json();

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json({ answer: fallbackChatAnswer() });
    }

    const trimmedQuestion = question.trim();

    // 1. Check fast rule-based query handler first (Zero AI Latency)
    const ruleAnswer = await handleRuleBasedChatQuery(user.id, trimmedQuestion);
    if (ruleAnswer) {
      return NextResponse.json({ answer: ruleAnswer });
    }

    // 2. Otherwise, load last 30 days of spending as context for Groq AI
    // NOTE: Privacy-preserving context ONLY (amounts, categories, types, dates - NO descriptions, friend names, notes, handles, group names)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentTxns = await db
      .select({
        amount: transactions.amount,
        category: transactions.category,
        type: transactions.type,
        date: transactions.date,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), gte(transactions.date, thirtyDaysAgo)));

    const totalExpenses = recentTxns
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    const totalIncome = recentTxns
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);

    const breakdown: Record<string, number> = {};
    for (const t of recentTxns.filter((t) => t.type === 'expense')) {
      breakdown[t.category] = (breakdown[t.category] ?? 0) + t.amount;
    }

    const context = {
      totalExpenses,
      totalIncome,
      breakdown,
      recentTransactions: recentTxns.map((t) => ({
        date: t.date,
        amount: t.amount,
        category: t.category,
        type: t.type,
      })),
      period: 'last 30 days',
    };

    let answer: string;
    try {
      answer = await askBudgetQuestion(trimmedQuestion.slice(0, 500), context);
    } catch (err: unknown) {
      const errorObj = err as Record<string, unknown>;
      console.error('[Chat Route] Groq Call Failed:', {
        message: err instanceof Error ? err.message : String(err),
        response: errorObj?.response,
      });
      answer = fallbackChatAnswer();
    }

    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[POST /api/chat]', err);
    return NextResponse.json({ answer: fallbackChatAnswer() });
  }
}
