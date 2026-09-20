import { rawClient } from '../lib/db/client';

async function reportCounts() {
  console.log('--- DATABASE COUNTS REPORT ---');
  const tables = [
    'users',
    'transactions',
    'friends',
    'lending_entries',
    'connections',
    'groups',
    'group_members',
    'shared_entries',
    'budget_limits',
    'rate_limits'
  ];

  for (const t of tables) {
    try {
      const res = await rawClient.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
      const count = res.rows[0]?.cnt ?? 0;
      console.log(`Table ${t}: ${count} rows`);
    } catch (e: any) {
      console.log(`Table ${t}: error (${e.message})`);
    }
  }

  // Users 8-char prefixes
  try {
    const uRes = await rawClient.execute('SELECT id, handle FROM users');
    console.log(`\nUser IDs (first 8 chars only):`);
    for (const r of uRes.rows) {
      const id = String(r.id || '');
      const handle = String(r.handle || '');
      console.log(`  Handle: ${handle} | ID prefix: ${id.slice(0, 8)}... (total len ${id.length})`);
    }
  } catch (e: any) {
    console.log(`Error reading users: ${e.message}`);
  }

  // Orphan checks
  console.log('\n--- ORPHAN CHECKS ---');
  const orphanQueries = [
    { name: 'transactions without user', sql: 'SELECT COUNT(*) as cnt FROM transactions WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)' },
    { name: 'friends without user', sql: 'SELECT COUNT(*) as cnt FROM friends WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)' },
    { name: 'lending_entries without user', sql: 'SELECT COUNT(*) as cnt FROM lending_entries WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)' },
    { name: 'connections with orphan requester', sql: 'SELECT COUNT(*) as cnt FROM connections WHERE requester_id NOT IN (SELECT id FROM users)' },
    { name: 'connections with orphan addressee', sql: 'SELECT COUNT(*) as cnt FROM connections WHERE addressee_id NOT IN (SELECT id FROM users)' },
    { name: 'groups with orphan created_by', sql: 'SELECT COUNT(*) as cnt FROM groups WHERE created_by NOT IN (SELECT id FROM users)' },
    { name: 'group_members with orphan user', sql: 'SELECT COUNT(*) as cnt FROM group_members WHERE user_id NOT IN (SELECT id FROM users)' },
    { name: 'shared_entries with orphan lender', sql: 'SELECT COUNT(*) as cnt FROM shared_entries WHERE lender_id NOT IN (SELECT id FROM users)' },
    { name: 'shared_entries with orphan borrower', sql: 'SELECT COUNT(*) as cnt FROM shared_entries WHERE borrower_id NOT IN (SELECT id FROM users)' },
  ];

  for (const q of orphanQueries) {
    try {
      const res = await rawClient.execute(q.sql);
      console.log(`  ${q.name}: ${res.rows[0]?.cnt ?? 0}`);
    } catch (e: any) {
      console.log(`  ${q.name}: error (${e.message})`);
    }
  }
}

reportCounts().catch(console.error);
