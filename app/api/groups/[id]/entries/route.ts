import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import {
  createSharedLoan,
  createSharedExpenseSplit,
  createSharedCustomSplit,
  recordPayment,
} from '@/lib/db/queries/shared-entries';
import { requireUser } from '@/lib/auth-helper';
import { z } from 'zod';

const entrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('loan'),
    lenderId: z.string(),
    borrowerId: z.string(),
    amountRupees: z.number().positive().max(1000000),
    note: z.string().max(100).optional(),
  }),
  z.object({
    type: z.literal('split'),
    totalRupees: z.number().positive().max(1000000),
    participantIds: z.array(z.string()).min(1),
    note: z.string().max(100).optional(),
  }),
  z.object({
    type: z.literal('custom_split'),
    shares: z.array(
      z.object({
        userId: z.string(),
        amountRupees: z.number().nonnegative().max(1000000),
      })
    ).min(1),
    note: z.string().max(100).optional(),
  }),
  z.object({
    type: z.literal('payment'),
    payeeId: z.string(),
    amountRupees: z.number().positive().max(1000000),
    note: z.string().max(100).optional(),
    upiRef: z.string().regex(/^\d{12}$/, 'UPI reference must be exactly 12 digits').optional().or(z.literal('')),
  }),
  z.object({
    type: z.literal('itemized_split'),
    payerId: z.string().optional(),
    totalPaise: z.number().int().positive().max(100000000),
    splits: z.array(
      z.object({
        borrowerId: z.string(),
        paise: z.number().int().positive().max(100000000),
        note: z.string().max(200).optional(),
      })
    ).min(1),
    description: z.string().max(100).optional(),
  }),
]);

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
    const parsed = entrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid entry payload' }, { status: 400 });
    }

    const data = parsed.data;

    if (data.type === 'loan') {
      const paise = Math.round(data.amountRupees * 100);
      const entry = await createSharedLoan(user.id, params.id, {
        lenderId: data.lenderId,
        borrowerId: data.borrowerId,
        paise,
        note: data.note,
      });
      return NextResponse.json(entry, { status: 201 });
    }

    if (data.type === 'split') {
      const totalPaise = Math.round(data.totalRupees * 100);
      const result = await createSharedExpenseSplit(user.id, params.id, {
        totalPaise,
        participantIds: data.participantIds,
        note: data.note,
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (data.type === 'custom_split') {
      const shares = data.shares.map((s) => ({
        userId: s.userId,
        paise: Math.round(s.amountRupees * 100),
      }));
      const result = await createSharedCustomSplit(user.id, params.id, {
        shares,
        note: data.note,
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (data.type === 'payment') {
      const paise = Math.round(data.amountRupees * 100);
      const upiRef = data.upiRef && data.upiRef.trim().length > 0 ? data.upiRef.trim() : undefined;
      const entry = await recordPayment(user.id, params.id, {
        payeeId: data.payeeId,
        paise,
        note: data.note,
        upiRef,
      });
      return NextResponse.json(entry, { status: 201 });
    }

    if (data.type === 'itemized_split') {
      const { createSharedItemizedSplit } = await import('@/lib/db/queries/shared-entries');
      const result = await createSharedItemizedSplit(user.id, params.id, {
        payerId: data.payerId,
        totalPaise: data.totalPaise,
        splits: data.splits,
        description: data.description,
      });
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid entry type' }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/groups/[id]/entries]', err);
    const message = err instanceof Error ? err.message : 'Failed to record entry';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
