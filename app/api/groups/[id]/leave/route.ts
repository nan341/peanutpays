import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { leaveGroup } from '@/lib/db/queries/groups';
import { requireUser } from '@/lib/auth-helper';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const result = await leaveGroup(user.id, params.id);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Cannot leave group' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/groups/[id]/leave]', err);
    const message = err instanceof Error ? err.message : 'Failed to leave group';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
