import { rawClient, isTurso } from '../lib/db/client';
import { ensureTablesExist } from '../lib/db/init';

async function run() {
  console.log('=== BudgetMitra Auth & DB Diagnosis ===');
  console.log('Database Mode:', isTurso ? 'Turso (Remote LibSQL)' : 'Local SQLite file (budgetmitra.db)');
  console.log('AUTH_SECRET Present:', !!process.env.AUTH_SECRET);
  console.log('AUTH_TRUST_HOST Present:', !!process.env.AUTH_TRUST_HOST);
  console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL || '(not set)');

  await ensureTablesExist();

  try {
    const tableRes = await rawClient.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      args: [],
    });
    console.log('Existing Tables:', tableRes.rows.map((r) => r.name));

    const usersRes = await rawClient.execute({
      sql: 'SELECT id, email, display_name, created_at FROM users',
      args: [],
    });
    console.log('Users Count:', usersRes.rows.length);
    console.log('Users (safe fields):', usersRes.rows.map((u) => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      created_at: u.created_at,
    })));
  } catch (err) {
    console.error('Error during DB inspection:', err);
  }
}

run();
