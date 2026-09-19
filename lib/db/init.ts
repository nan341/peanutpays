import { db, AppDb } from './client';
import { sql } from 'drizzle-orm';

export async function ensureSchema(targetDb: AppDb = db) {
  // Users
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle)`);

  // Rate limits
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (key, window_start)
    )
  `);

  // Transactions
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      date TEXT NOT NULL DEFAULT (current_timestamp)
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date)`);

  // Friends
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      name TEXT NOT NULL
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id)`);

  // Lending entries
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS lending_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      friend_id INTEGER NOT NULL REFERENCES friends(id),
      amount REAL NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('lent', 'borrowed')),
      note TEXT,
      date TEXT NOT NULL DEFAULT (current_timestamp),
      settled INTEGER NOT NULL DEFAULT 0
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_lending_entries_user_id ON lending_entries(user_id)`);

  // Connections
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id),
      addressee_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted')),
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_connections_req ON connections(requester_id)`);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_connections_addr ON connections(addressee_id)`);

  // Groups
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    )
  `);

  // Group Members
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      status TEXT NOT NULL CHECK(status IN ('invited', 'active')),
      joined_at TEXT NOT NULL DEFAULT (current_timestamp),
      PRIMARY KEY (group_id, user_id)
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`);

  // Shared Entries
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS shared_entries (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      lender_id TEXT NOT NULL REFERENCES users(id),
      borrower_id TEXT NOT NULL REFERENCES users(id),
      paise INTEGER NOT NULL CHECK(paise > 0),
      kind TEXT NOT NULL CHECK(kind IN ('loan', 'payment')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed')),
      note TEXT,
      batch_id TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      CHECK(lender_id <> borrower_id)
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_shared_entries_group ON shared_entries(group_id)`);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_shared_entries_lender ON shared_entries(lender_id)`);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_shared_entries_borrower ON shared_entries(borrower_id)`);

  // Budget Limits
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS budget_limits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      monthly_limit REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    )
  `);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_budget_limits_user ON budget_limits(user_id)`);
  await targetDb.run(sql`CREATE INDEX IF NOT EXISTS idx_budget_limits_user_cat ON budget_limits(user_id, category)`);
}

let initialized = false;

export async function ensureTablesExist(targetDb: AppDb = db) {
  if (initialized && targetDb === db) return;
  await ensureSchema(targetDb);
  if (targetDb === db) {
    initialized = true;
  }
}
