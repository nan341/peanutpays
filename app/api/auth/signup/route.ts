import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { rawClient } from '@/lib/db/client';
import { ensureTablesExist } from '@/lib/db/init';
import { rateLimit } from '@/lib/rate-limit';

const RESERVED_HANDLES = new Set(['admin', 'support', 'me', 'you', 'null', 'undefined']);

const signupSchema = z.object({
  email: z.string().email().max(100),
  handle: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/, 'Handle must contain only lowercase letters, numbers, and underscores')
    .refine((h) => !RESERVED_HANDLES.has(h), 'Handle is reserved'),
  displayName: z.string().trim().min(1).max(40),
  password: z.string().min(8).max(72),
});

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = signupSchema.safeParse({
      email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
      handle: typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '',
      displayName: body.displayName,
      password: body.password,
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Invalid input';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, handle, displayName, password } = parsed.data;

    // Rate limit signup attempts
    const rl = await rateLimit(`signup:${email}`, 5, 60);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 });
    }

    await ensureTablesExist();

    // Check if email or handle already exists
    const existing = await rawClient.execute({
      sql: 'SELECT id, email, handle FROM users WHERE lower(email) = ? OR lower(handle) = ?',
      args: [email, handle],
    });

    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if ((match.email as string).toLowerCase() === email) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
      }
      if ((match.handle as string).toLowerCase() === handle) {
        return NextResponse.json({ error: 'Handle already taken' }, { status: 400 });
      }
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    await rawClient.execute({
      sql: 'INSERT INTO users (id, email, handle, display_name, password_hash) VALUES (?, ?, ?, ?, ?)',
      args: [userId, email, handle, displayName, passwordHash],
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        handle,
        displayName,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[SIGNUP ERROR]', err);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
