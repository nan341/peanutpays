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

const collectLinkSchema = z.object({
  payerId: z.string().min(1),
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
    const rl = await rateLimit(`collect-link:${user.id}`, 20, 60);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = collectLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { payerId, paise } = parsed.data;

    await ensureTablesExist();

    // Verify session user has a UPI ID
    const [currentUser] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        upiId: users.upiId,
      })
      .from(users)
      .where(eq(users.id, user.id));

    if (!currentUser || !currentUser.upiId) {
      return NextResponse.json(
        { error: 'You have not added a UPI ID', code: 'YOU_HAVE_NO_UPI' },
        { status: 409 }
      );
    }

    // Verify group and active memberships
    const groupData = await getGroupDetails(user.id, params.id);
    if (!groupData || !groupData.members) {
      return NextResponse.json({ error: 'Ledger not found or unauthorized' }, { status: 404 });
    }

    const payerMember = groupData.members.find((m) => m.userId === payerId && m.status === 'active');
    if (!payerMember) {
      return NextResponse.json({ error: 'Payer is not an active member in this ledger' }, { status: 404 });
    }

    // Check what payer owes session user
    const directOwed = groupData.pairwise?.find((p) => p.from === payerId && p.to === user.id)?.paise ?? 0;
    const planOwed = groupData.plan?.find((p) => p.from === payerId && p.to === user.id)?.paise ?? 0;
    const allowedMax = Math.max(directOwed, planOwed);

    if (allowedMax <= 0) {
      return NextResponse.json(
        { error: 'This member does not owe you in this ledger' },
        { status: 400 }
      );
    }

    if (paise > allowedMax) {
      return NextResponse.json(
        { error: 'Amount exceeds the balance owed in this ledger' },
        { status: 400 }
      );
    }

    const uri = buildUpiUri({
      vpa: currentUser.upiId,
      name: currentUser.displayName,
      paise,
    });

    return NextResponse.json({
      uri,
      amountPaise: paise,
      payerName: payerMember.displayName,
    });
  } catch (err) {
    console.error('[POST /api/groups/[id]/collect-link]', err);
    return NextResponse.json({ error: 'Failed to generate collect link' }, { status: 500 });
  }
}
