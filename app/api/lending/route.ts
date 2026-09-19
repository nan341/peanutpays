import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import {
  getPersonalFriendsAndEntries,
  addPersonalLendingEntry,
  settlePersonalLendingEntry,
  deletePersonalLendingEntry,
} from '@/lib/db/queries/personal-lending';
import { requireUser } from '@/lib/auth-helper';
import { z } from 'zod';

const createEntrySchema = z.object({
  friendName: z.string().trim().min(1).max(40),
  amount: z.number().positive().max(1000000),
  direction: z.enum(['lent', 'borrowed']),
  note: z.string().max(100).optional(),
});

export async function GET() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const result = await getPersonalFriendsAndEntries(user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/lending]', err);
    return NextResponse.json({ error: 'Failed to fetch lending data' }, { status: 500 });
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
    const parsed = createEntrySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const entry = await addPersonalLendingEntry(user.id, parsed.data);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error('[POST /api/lending]', err);
    return NextResponse.json({ error: 'Failed to create lending entry' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    const entryId = typeof body.entryId === 'number' ? body.entryId : parseInt(body.entryId, 10);

    if (!entryId || isNaN(entryId)) {
      return NextResponse.json({ error: 'Missing or invalid entryId' }, { status: 400 });
    }

    const settled = await settlePersonalLendingEntry(user.id, entryId);
    if (!settled) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/lending]', err);
    return NextResponse.json({ error: 'Failed to settle entry' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const entryId = parseInt(searchParams.get('id') || '', 10);
    if (isNaN(entryId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await ensureTablesExist();
    const deleted = await deletePersonalLendingEntry(user.id, entryId);
    if (!deleted) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/lending]', err);
    return NextResponse.json({ error: 'Failed to delete lending entry' }, { status: 500 });
  }
}
