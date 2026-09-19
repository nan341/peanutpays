import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { getUserTransactions, addUserTransaction, deleteUserTransaction } from '@/lib/db/queries/transactions';
import { categorizeByRules } from '@/lib/categorize-rules';
import { categorizeWithAI } from '@/lib/ai/groq';
import { fallbackCategory } from '@/lib/ai/fallback';
import { requireUser } from '@/lib/auth-helper';
import { z } from 'zod';

const createTransactionSchema = z.object({
  amount: z.number().positive().max(100000000),
  description: z.string().trim().min(1).max(200),
  type: z.enum(['income', 'expense']),
  date: z.string().optional(),
});

export async function GET() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const rows = await getUserTransactions(user.id);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/transactions]', err);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
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
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { amount, description, type, date } = parsed.data;

    let category = categorizeByRules(description);
    if (!category) {
      try {
        category = await categorizeWithAI(description);
      } catch {
        category = fallbackCategory();
      }
    }

    const row = await addUserTransaction(user.id, {
      amount,
      description,
      category,
      type,
      date,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error('[POST /api/transactions]', err);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get('id') || '', 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await ensureTablesExist();
    const deleted = await deleteUserTransaction(user.id, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/transactions]', err);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
