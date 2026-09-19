import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';
import { rateLimit } from '../lib/rate-limit';

describe('Database Foundation & Rate Limits', () => {
  it('initializes schema on a fresh in-memory database', async () => {
    const memClient = createClient({ url: ':memory:' });
    const memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb);

    const tablesRes = await memClient.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = tablesRes.rows.map((r) => r.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('rate_limits');
    expect(tableNames).toContain('transactions');
    expect(tableNames).toContain('friends');
    expect(tableNames).toContain('lending_entries');
    expect(tableNames).toContain('connections');
    expect(tableNames).toContain('groups');
    expect(tableNames).toContain('group_members');
    expect(tableNames).toContain('shared_entries');
  });

  it('enforces rate limits correctly', async () => {
    const memClient = createClient({ url: ':memory:' });
    const memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb);

    const key = 'test-rate-limit-key';
    const max = 3;
    const windowSeconds = 60;

    const res1 = await rateLimit(key, max, windowSeconds, memDb);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = await rateLimit(key, max, windowSeconds, memDb);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = await rateLimit(key, max, windowSeconds, memDb);
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);

    const res4 = await rateLimit(key, max, windowSeconds, memDb);
    expect(res4.success).toBe(false);
    expect(res4.remaining).toBe(0);
  });
});
