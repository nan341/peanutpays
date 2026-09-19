import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import path from 'path';

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(process.cwd(), 'budgetmitra.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const rawClient = createClient({
  url,
  ...(authToken ? { authToken } : {}),
});

export const isTurso = !!process.env.TURSO_DATABASE_URL;
export const db = drizzle(rawClient, { schema });
export type AppDb = typeof db;
