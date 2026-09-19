import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import { deleteUserTransaction } from '@/lib/db/queries/transactions';
import { requireUser } from '@/lib/auth-helper';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid transaction ID' }, { status: 400 });
    }

    await ensureTablesExist();
    const deleted = await deleteUserTransaction(user.id, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/transactions/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
