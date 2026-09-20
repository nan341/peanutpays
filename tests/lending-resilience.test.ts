import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema, checkSchemaDrift } from '../lib/db/init';
import { getPersonalFriendsAndEntries } from '../lib/db/queries/personal-lending';
import { getConnections } from '../lib/db/queries/connections';
import { getUserGroups } from '../lib/db/queries/groups';
import bcrypt from 'bcryptjs';

describe('Lending Page Resilience & Schema Consistency Tests', () => {
  let memDb: ReturnType<typeof drizzle>;
  let memClient: ReturnType<typeof createClient>;
  const userA = { id: 'uA_lending', email: 'la@ex.com', handle: 'user_la', displayName: 'User LA' };

  beforeEach(async () => {
    memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    const hash = await bcrypt.hash('pass1234', 12);
    await memDb.insert(schema.users).values([
      { ...userA, passwordHash: hash },
    ]);
  });

  it('lending query helpers return valid array shapes for fresh user', async () => {
    const personal = await getPersonalFriendsAndEntries(userA.id, memDb as any);
    expect(Array.isArray(personal)).toBe(true);
    expect(personal.length).toBe(0);

    const conns = await getConnections(userA.id, memDb as any);
    expect(Array.isArray(conns.accepted)).toBe(true);
    expect(Array.isArray(conns.incoming)).toBe(true);
    expect(Array.isArray(conns.outgoing)).toBe(true);

    const grps = await getUserGroups(userA.id, memDb as any);
    expect(Array.isArray(grps)).toBe(true);
    expect(grps.length).toBe(0);
  });

  it('ensureSchema creates all expected tables and columns identically to migration specification', async () => {
    const freshClient = createClient({ url: ':memory:' });
    const freshDb = drizzle(freshClient, { schema });
    await ensureSchema(freshDb as any);

    const tables = [
      'users',
      'rate_limits',
      'transactions',
      'friends',
      'lending_entries',
      'connections',
      'groups',
      'group_members',
      'shared_entries',
      'budget_limits',
    ];

    for (const t of tables) {
      const res = await freshClient.execute(`PRAGMA table_info(${t})`);
      expect(res.rows.length).toBeGreaterThan(0);
    }

    // Verify key columns on users and shared_entries
    const usersInfo = await freshClient.execute('PRAGMA table_info(users)');
    const userCols = usersInfo.rows.map((r: any) => r.name);
    expect(userCols).toContain('upi_id');
    expect(userCols).toContain('upi_id_updated_at');

    const sharedInfo = await freshClient.execute('PRAGMA table_info(shared_entries)');
    const sharedCols = sharedInfo.rows.map((r: any) => r.name);
    expect(sharedCols).toContain('upi_ref');

    // Run drift check without throwing
    await checkSchemaDrift(freshDb as any);
  });
});
