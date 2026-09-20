import fs from 'fs';
import path from 'path';
import { db, rawClient } from '../lib/db/client';
import { ensureSchema } from '../lib/db/init';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

async function tableExists(tableName: string): Promise<boolean> {
  const res = await rawClient.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    args: [tableName],
  });
  return res.rows.length > 0;
}

async function migrate() {
  console.log('Starting database migration...');

  const dbPath = path.join(process.cwd(), 'budgetmitra.db');
  const bakPath = path.join(process.cwd(), 'budgetmitra.db.bak');

  if (fs.existsSync(dbPath) && !process.env.TURSO_DATABASE_URL) {
    fs.copyFileSync(dbPath, bakPath);
    console.log(`Backed up ${dbPath} to ${bakPath}`);
  }

  // Check existing tables and add user_id column if missing before creating indexes
  const tables = ['transactions', 'friends', 'lending_entries'];

  for (const table of tables) {
    const exists = await tableExists(table);
    if (exists) {
      const info = await rawClient.execute(`PRAGMA table_info(${table})`);
      const columns = (info.rows as unknown as ColumnInfo[]).map((col) => col.name);

      if (!columns.includes('user_id')) {
        console.log(`Adding column user_id to table ${table}...`);
        await rawClient.execute(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
        console.log(`Successfully added user_id to ${table}`);
      } else {
        console.log(`Column user_id already exists on ${table}.`);
      }
    }
  }

  // Check users table for upi_id and upi_id_updated_at
  if (await tableExists('users')) {
    const info = await rawClient.execute(`PRAGMA table_info(users)`);
    const cols = (info.rows as unknown as ColumnInfo[]).map((c) => c.name);
    if (!cols.includes('upi_id')) {
      console.log('Adding column upi_id to users...');
      await rawClient.execute(`ALTER TABLE users ADD COLUMN upi_id TEXT`);
    }
    if (!cols.includes('upi_id_updated_at')) {
      console.log('Adding column upi_id_updated_at to users...');
      await rawClient.execute(`ALTER TABLE users ADD COLUMN upi_id_updated_at TEXT`);
    }
  }

  // Check shared_entries table for upi_ref
  if (await tableExists('shared_entries')) {
    const info = await rawClient.execute(`PRAGMA table_info(shared_entries)`);
    const cols = (info.rows as unknown as ColumnInfo[]).map((c) => c.name);
    if (!cols.includes('upi_ref')) {
      console.log('Adding column upi_ref to shared_entries...');
      await rawClient.execute(`ALTER TABLE shared_entries ADD COLUMN upi_ref TEXT`);
    }
  }

  // Ensure full schema and indexes
  await ensureSchema(db);
  console.log('Ensured all table schemas and indexes exist.');

  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
