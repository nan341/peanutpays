import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { inviteMembersToGroup } from '@/lib/db/queries/groups';
import { requireUser } from '@/lib/auth-helper';
import { z } from 'zod';

const inviteSchema = z.object({
  inviteeUserIds: z.array(z.string()).min(1),
});

export async function POST(
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
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please provide valid user IDs to invite' }, { status: 400 });
    }

    const invited = await inviteMembersToGroup(user.id, params.id, parsed.data.inviteeUserIds);
    return NextResponse.json({ success: true, invited }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/groups/[id]/invite]', err);
    const message = err instanceof Error ? err.message : 'Failed to invite members';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
