import { rawClient } from '../lib/db/client';
import { ensureTablesExist } from '../lib/db/init';

async function assignOrphans() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: tsx scripts/assign-orphans.ts <email>');
    process.exit(1);
  }

  await ensureTablesExist();

  const userRes = await rawClient.execute({
    sql: 'SELECT id, email, display_name FROM users WHERE lower(email) = ?',
    args: [email],
  });

  if (userRes.rows.length === 0) {
    console.error(`User with email "${email}" not found.`);
    process.exit(1);
  }

  const user = userRes.rows[0];
  const userId = user.id as string;
  console.log(`Assigning orphaned rows to user: ${user.display_name} (${user.email}, ID: ${userId})`);

  const tRes = await rawClient.execute({
    sql: 'UPDATE transactions SET user_id = ? WHERE user_id IS NULL',
    args: [userId],
  });

  const fRes = await rawClient.execute({
    sql: 'UPDATE friends SET user_id = ? WHERE user_id IS NULL',
    args: [userId],
  });

  const lRes = await rawClient.execute({
    sql: 'UPDATE lending_entries SET user_id = ? WHERE user_id IS NULL',
    args: [userId],
  });

  console.log(`Updated transactions: ${tRes.rowsAffected} rows`);
  console.log(`Updated friends: ${fRes.rowsAffected} rows`);
  console.log(`Updated lending_entries: ${lRes.rowsAffected} rows`);
  console.log('Orphan assignment completed successfully.');
}

assignOrphans().catch((err) => {
  console.error('Failed to assign orphans:', err);
  process.exit(1);
});
