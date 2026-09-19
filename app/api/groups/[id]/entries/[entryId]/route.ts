import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { confirmOrRejectPayment, deleteSharedEntry } from '@/lib/db/queries/shared-entries';
import { requireUser } from '@/lib/auth-helper';
import { z } from 'zod';

const patchSchema = z.object({
  action: z.enum(['confirm', 'reject']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
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

    const ok = await confirmOrRejectPayment(user.id, params.entryId, parsed.data.action);
    if (!ok) {
      return NextResponse.json({ error: 'Payment not found or you are not authorized to confirm/reject it' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/groups/[id]/entries/[entryId]]', err);
    const message = err instanceof Error ? err.message : 'Failed to update entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const ok = await deleteSharedEntry(user.id, params.entryId);
    if (!ok) {
      return NextResponse.json({ error: 'Entry not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/groups/[id]/entries/[entryId]]', err);
    const message = err instanceof Error ? err.message : 'Failed to delete entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
