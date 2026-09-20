import { NextRequest, NextResponse } from 'next/server';
import { ensureTablesExist } from '@/lib/db/init';
import {
  sendConnectionRequest,
  getConnections,
  respondToConnectionRequest,
  removeConnection,
} from '@/lib/db/queries/connections';
import { requireUser } from '@/lib/auth-helper';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  handle: z
    .string()
    .trim()
    .transform((val) => val.replace(/^@+/, ''))
    .pipe(z.string().min(3).max(20)),
});

const patchSchema = z.object({
  connectionId: z.string(),
  action: z.enum(['accept', 'decline']),
});

export async function GET() {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    await ensureTablesExist();
    const data = await getConnections(user.id);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    console.error('[GET /api/connections]', err);
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 400 });
    }

    const rl = await rateLimit(`conn_req:${user.id}`, 10, 60);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    await ensureTablesExist();
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: true,
        message: 'If this handle exists, a connection request has been sent.',
      });
    }

    const result = await sendConnectionRequest(user.id, parsed.data.handle);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/connections]', err);
    return NextResponse.json({
      success: true,
      message: 'If this handle exists, a connection request has been sent.',
    });
  }
}

export async function PATCH(req: NextRequest) {
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

    const success = await respondToConnectionRequest(user.id, parsed.data.connectionId, parsed.data.action);
    if (!success) {
      return NextResponse.json({ error: 'Connection request not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/connections]', err);
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireUser();
    if (authResult.errorResponse) return authResult.errorResponse;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing connection ID' }, { status: 400 });
    }

    await ensureTablesExist();
    const result = await removeConnection(user.id, id);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to remove connection' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/connections]', err);
    return NextResponse.json({ error: 'Failed to remove connection' }, { status: 500 });
  }
}
