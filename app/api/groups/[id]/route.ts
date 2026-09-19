import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { getGroupDetails } from '@/lib/db/queries/shared-entries';
import { respondToGroupInvite, promoteMemberToAdmin } from '@/lib/db/queries/groups';
import { requireUser } from '@/lib/auth-helper';
import { z } from 'zod';

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['accept', 'decline']),
  }),
  z.object({
    action: z.literal('promote'),
    targetUserId: z.string(),
  }),
]);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const details = await getGroupDetails(user.id, params.id);
    if (!details) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (err) {
    console.error('[GET /api/groups/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    if (parsed.data.action === 'accept' || parsed.data.action === 'decline') {
      const ok = await respondToGroupInvite(user.id, params.id, parsed.data.action);
      if (!ok) {
        return NextResponse.json({ error: 'Invite not found or already processed' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (parsed.data.action === 'promote') {
      await promoteMemberToAdmin(user.id, params.id, parsed.data.targetUserId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[PATCH /api/groups/[id]]', err);
    const message = err instanceof Error ? err.message : 'Failed to update group';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
