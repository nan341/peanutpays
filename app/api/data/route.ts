import { NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { clearUserData } from '@/lib/db/queries/user-data';
import { requireUser } from '@/lib/auth-helper';

export async function DELETE() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    await clearUserData(user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/data]', err);
    return NextResponse.json({ error: 'Failed to clear data' }, { status: 500 });
  }
}
