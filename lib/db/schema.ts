import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  handle: text('handle').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').notNull(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.key, table.windowStart] }),
}));

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  date: text('date').notNull().default(sql`(current_timestamp)`),
});

export const friends = sqliteTable('friends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
});

export const lendingEntries = sqliteTable('lending_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  friendId: integer('friend_id').notNull().references(() => friends.id),
  amount: real('amount').notNull(),
  direction: text('direction', { enum: ['lent', 'borrowed'] }).notNull(),
  note: text('note'),
  date: text('date').notNull().default(sql`(current_timestamp)`),
  settled: integer('settled', { mode: 'boolean' }).notNull().default(false),
});

export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  requesterId: text('requester_id').notNull().references(() => users.id),
  addresseeId: text('addressee_id').notNull().references(() => users.id),
  status: text('status', { enum: ['pending', 'accepted'] }).notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['direct', 'group'] }).notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const groupMembers = sqliteTable('group_members', {
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  status: text('status', { enum: ['invited', 'active'] }).notNull(),
  joinedAt: text('joined_at').notNull().default(sql`(current_timestamp)`),
}, (table) => ({
  pk: primaryKey({ columns: [table.groupId, table.userId] }),
}));

export const sharedEntries = sqliteTable('shared_entries', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  lenderId: text('lender_id').notNull().references(() => users.id),
  borrowerId: text('borrower_id').notNull().references(() => users.id),
  paise: integer('paise').notNull(),
  kind: text('kind', { enum: ['loan', 'payment'] }).notNull(),
  status: text('status', { enum: ['pending', 'confirmed'] }).notNull(),
  note: text('note'),
  batchId: text('batch_id'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const budgetLimits = sqliteTable('budget_limits', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  category: text('category').notNull(),
  monthlyLimit: real('monthly_limit').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
});

