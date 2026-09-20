import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helper';
import { ensureTablesExist } from '@/lib/db/init';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();

    const [profile] = await db
      .select({
        id: users.id,
        email: users.email,
        handle: users.handle,
        displayName: users.displayName,
        upiId: users.upiId,
        upiIdUpdatedAt: users.upiIdUpdatedAt,
      })
      .from(users)
      .where(eq(users.id, user.id));

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (err) {
    console.error('[GET /api/profile]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
