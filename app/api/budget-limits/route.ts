import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helper';
import { ensureTablesExist } from '@/lib/db/init';
import {
  getBudgetLimitsByUser,
  upsertBudgetLimit,
  deleteBudgetLimit,
} from '@/lib/db/queries/budget-limits';
import { z } from 'zod';

const setBudgetLimitSchema = z.object({
  category: z.string().trim().min(1).max(50),
  monthlyLimit: z.number().positive().max(100000000),
});

export async function GET() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const rows = await getBudgetLimitsByUser(user.id);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/budget-limits]', err);
    return NextResponse.json({ error: 'Failed to fetch budget limits' }, { status: 500 });
  }
}

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
    const body = await req.json();
    const parsed = setBudgetLimitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid budget limit payload' }, { status: 400 });
    }

    const { category, monthlyLimit } = parsed.data;
    const row = await upsertBudgetLimit(user.id, category, monthlyLimit);
    return NextResponse.json(row, { status: 200 });
  } catch (err) {
    console.error('[POST /api/budget-limits]', err);
    return NextResponse.json({ error: 'Failed to save budget limit' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    await ensureTablesExist();
    await deleteBudgetLimit(user.id, category);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/budget-limits]', err);
    return NextResponse.json({ error: 'Failed to delete budget limit' }, { status: 500 });
  }
}
