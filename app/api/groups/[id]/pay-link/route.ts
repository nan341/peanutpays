import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helper';
import { ensureTablesExist } from '@/lib/db/init';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { getGroupDetails } from '@/lib/db/queries/shared-entries';
import { eq } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';
import { buildUpiUri } from '@/lib/upi';
import { z } from 'zod';

const payLinkSchema = z.object({
  payeeId: z.string().min(1),
  paise: z.number().int().positive(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    // Rate limit per user
    const rl = await rateLimit(`pay-link:${user.id}`, 20, 60);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many payment requests. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = payLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { payeeId, paise } = parsed.data;

    await ensureTablesExist();

    // Verify group and active memberships
    const groupData = await getGroupDetails(user.id, params.id);
    if (!groupData || !groupData.members) {
      return NextResponse.json({ error: 'Ledger not found or unauthorized' }, { status: 404 });
    }

    const payerMember = groupData.members.find((m) => m.userId === user.id && m.status === 'active');
    const payeeMember = groupData.members.find((m) => m.userId === payeeId && m.status === 'active');

    if (!payerMember || !payeeMember) {
      return NextResponse.json({ error: 'Active member not found in ledger' }, { status: 404 });
    }

    // Fetch payee's UPI ID and updated timestamp
    const [payeeUser] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        upiId: users.upiId,
        upiIdUpdatedAt: users.upiIdUpdatedAt,
      })
      .from(users)
      .where(eq(users.id, payeeId));

    if (!payeeUser || !payeeUser.upiId) {
      return NextResponse.json(
        { error: 'Payee has not added a UPI ID', code: 'PAYEE_NO_UPI' },
        { status: 409 }
      );
    }

    // Validate maximum allowed amount in this ledger
    const directOwed = groupData.pairwise?.find((p) => p.from === user.id && p.to === payeeId)?.paise ?? 0;
    const planOwed = groupData.plan?.find((p) => p.from === user.id && p.to === payeeId)?.paise ?? 0;
    const allowedMax = Math.max(directOwed, planOwed);

    if (allowedMax <= 0) {
      return NextResponse.json(
        { error: 'You do not owe this member in this ledger' },
        { status: 400 }
      );
    }

    if (paise > allowedMax) {
      return NextResponse.json(
        { error: 'Amount exceeds the balance owed in this ledger' },
        { status: 400 }
      );
    }

    // Check if UPI ID was updated within the last 7 days
    let vpaChangedRecently = false;
    if (payeeUser.upiIdUpdatedAt) {
      const updatedTime = new Date(payeeUser.upiIdUpdatedAt).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - updatedTime < sevenDaysMs) {
        vpaChangedRecently = true;
      }
    }

    const uri = buildUpiUri({
      vpa: payeeUser.upiId,
      name: payeeUser.displayName,
      paise,
    });

    return NextResponse.json({
      uri,
      payeeName: payeeUser.displayName,
      vpa: payeeUser.upiId,
      amountPaise: paise,
      vpaChangedRecently,
    });
  } catch (err) {
    console.error('[POST /api/groups/[id]/pay-link]', err);
    return NextResponse.json({ error: 'Failed to generate pay link' }, { status: 500 });
  }
}
