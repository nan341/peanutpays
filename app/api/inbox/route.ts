import { NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { getInbox } from '@/lib/db/queries/inbox';
import { requireUser } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const data = await getInbox(user.id);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[GET /api/inbox]', err);
    return NextResponse.json({ error: 'Failed to fetch inbox' }, { status: 500 });
  }
}
