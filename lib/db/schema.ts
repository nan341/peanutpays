import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  date: text("date").notNull().default(sql`(current_timestamp)`),
});

export const friends = sqliteTable("friends", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const lendingEntries = sqliteTable("lending_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  friendId: integer("friend_id").notNull().references(() => friends.id),
  amount: real("amount").notNull(),
  direction: text("direction", { enum: ["lent", "borrowed"] }).notNull(),
  note: text("note"),
  date: text("date").notNull().default(sql`(current_timestamp)`),
  settled: integer("settled", { mode: "boolean" }).notNull().default(false),
});
