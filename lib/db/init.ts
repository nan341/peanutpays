import { db } from "./client";
import { sql } from "drizzle-orm";

let initialized = false;

export async function ensureTablesExist() {
  if (initialized) return;
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      date TEXT NOT NULL DEFAULT (current_timestamp)
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS lending_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      friend_id INTEGER NOT NULL REFERENCES friends(id),
      amount REAL NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('lent', 'borrowed')),
      note TEXT,
      date TEXT NOT NULL DEFAULT (current_timestamp),
      settled INTEGER NOT NULL DEFAULT 0
    )
  `);
  initialized = true;
}
