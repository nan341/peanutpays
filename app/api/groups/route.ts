import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { createGroup, getUserGroups } from '@/lib/db/queries/groups';
import { requireUser } from '@/lib/auth-helper';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export async function GET() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const groups = await getUserGroups(user.id);
    return NextResponse.json(groups, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    console.error('[GET /api/groups]', err);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
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
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Group name must be between 1 and 40 characters' }, { status: 400 });
    }

    const group = await createGroup(user.id, parsed.data.name);
    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups]', err);
    const message = err instanceof Error ? err.message : 'Failed to create group';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
