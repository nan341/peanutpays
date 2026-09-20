import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import path from 'path';

const localDbPath = path.resolve(process.cwd(), 'budgetmitra.db');
const url = process.env.TURSO_DATABASE_URL || `file:${localDbPath}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const rawClient = createClient({
  url,
  ...(authToken ? { authToken } : {}),
});

export const isTurso = !!process.env.TURSO_DATABASE_URL;

// Safe startup logging (no secrets or tokens)
if (isTurso) {
  try {
    const parsed = new URL(process.env.TURSO_DATABASE_URL!);
    console.log(`[DB] Connected to Turso host: ${parsed.hostname}`);
  } catch {
    console.log('[DB] Connected to Turso (remote)');
  }
} else {
  console.log(`[DB] Connected to local SQLite database at: ${localDbPath}`);
}

export const db = drizzle(rawClient, { schema });
export type AppDb = typeof db;

