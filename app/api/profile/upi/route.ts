import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helper';
import { ensureTablesExist } from '@/lib/db/init';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';
import { isValidVpa, normalizeVpa } from '@/lib/upi';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const updateUpiSchema = z.object({
  upiId: z.string().nullable().optional(),
  currentPassword: z.string().min(1, 'Password is required'),
});

export async function PATCH(req: NextRequest) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    // Rate limit per user
    const rl = await rateLimit(`upi-profile:${user.id}`, 5, 60);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updateUpiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const { upiId, currentPassword } = parsed.data;

    await ensureTablesExist();

    // Verify current password with bcrypt
    const [dbUser] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, user.id));

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
    }

    // Process UPI ID update or clear
    if (upiId && upiId.trim().length > 0) {
      const trimmed = upiId.trim();
      if (!isValidVpa(trimmed)) {
        return NextResponse.json({ error: 'Invalid UPI ID format' }, { status: 400 });
      }

      const normalized = normalizeVpa(trimmed);
      const updatedAt = new Date().toISOString();

      await db
        .update(users)
        .set({
          upiId: normalized,
          upiIdUpdatedAt: updatedAt,
        })
        .where(eq(users.id, user.id));

      return NextResponse.json({
        success: true,
        upiId: normalized,
        upiIdUpdatedAt: updatedAt,
      });
    } else {
      // Clear UPI ID
      await db
        .update(users)
        .set({
          upiId: null,
          upiIdUpdatedAt: null,
        })
        .where(eq(users.id, user.id));

      return NextResponse.json({
        success: true,
        upiId: null,
        upiIdUpdatedAt: null,
      });
    }
  } catch (err) {
    console.error('[PATCH /api/profile/upi]', err);
    return NextResponse.json({ error: 'Failed to update UPI settings' }, { status: 500 });
  }
}
