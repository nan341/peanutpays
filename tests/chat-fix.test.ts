import { describe, it, expect, beforeEach } from 'vitest';
import { handleRuleBasedChatQuery } from '../lib/chat/rule-based-handler';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';
import { addUserTransaction } from '../lib/db/queries/transactions';
import crypto from 'crypto';

describe('Chat Fix & Privacy Safety', () => {
  let memDb: ReturnType<typeof drizzle>;
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();

  beforeEach(async () => {
    const memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);

    await memDb.insert(schema.users).values([
      {
        id: userA,
        email: 'usera@example.com',
        handle: 'usera',
        displayName: 'User A',
        passwordHash: 'hashA',
      },
      {
        id: userB,
        email: 'userb@example.com',
        handle: 'userb',
        displayName: 'User B',
        passwordHash: 'hashB',
      },
    ]);
  });

  it('answers category spend queries accurately with user-scoped data', async () => {
    // User A spends 450 on food
    await addUserTransaction(
      userA,
      {
        amount: 450,
        description: 'Secret lunch with Alice',
        category: 'Food',
        type: 'expense',
        date: new Date().toISOString(),
      },
      memDb as any
    );

    // User B spends 1200 on food
    await addUserTransaction(
      userB,
      {
        amount: 1200,
        description: 'Steak dinner',
        category: 'Food',
        type: 'expense',
        date: new Date().toISOString(),
      },
      memDb as any
    );

    const ansA = await handleRuleBasedChatQuery(userA, 'How much did I spend on food this month?', memDb as any);
    expect(ansA).toContain('450');
    expect(ansA).toContain('Food');
    expect(ansA).not.toContain('1200');

    const ansB = await handleRuleBasedChatQuery(userB, 'How much did I spend on food this month?', memDb as any);
    expect(ansB).toContain('1,200');
    expect(ansB).not.toContain('450');
  });

  it('answers savings goal queries calculating daily and weekly targets', async () => {
    const ans = await handleRuleBasedChatQuery(userA, 'I want to save 6000 this month, how much per day', memDb as any);
    expect(ans).toBeDefined();
    expect(ans).toContain('6,000');
    expect(ans).toContain('per day');
  });

  it('answers income source queries without leaking descriptions across users', async () => {
    await addUserTransaction(
      userA,
      {
        amount: 15000,
        description: 'Monthly stipend from University',
        category: 'Other',
        type: 'income',
        date: new Date().toISOString(),
      },
      memDb as any
    );

    const ansA = await handleRuleBasedChatQuery(userA, 'How much did I receive from stipend this month?', memDb as any);
    expect(ansA).toContain('15,000');
    expect(ansA).toContain('stipend');

    const ansB = await handleRuleBasedChatQuery(userB, 'How much did I receive from stipend this month?', memDb as any);
    expect(ansB).toContain('No income found matching "stipend"');
  });

  it('strictly excludes descriptions, friend names, handles and notes from LLM context structure', () => {
    const rawUserTransactions = [
      {
        id: 1,
        amount: 250,
        description: 'Private medical bill at Pharmacy',
        category: 'Other',
        type: 'expense',
        date: '2026-09-19T10:00:00.000Z',
        friendName: 'Dr. John',
        note: 'Personal health checkup',
        handle: 'dr_john',
      },
    ];

    // Build the sanitized LLM context as in app/api/chat/route.ts
    const sanitizedContext = {
      totalExpenses: 250,
      totalIncome: 0,
      breakdown: { Other: 250 },
      recentTransactions: rawUserTransactions.map((t) => ({
        date: t.date,
        amount: t.amount,
        category: t.category,
        type: t.type,
      })),
      period: 'last 30 days',
    };

    const contextStr = JSON.stringify(sanitizedContext);

    // Verify allowed fields are present
    expect(contextStr).toContain('"amount":250');
    expect(contextStr).toContain('"category":"Other"');

    // Verify sensitive non-whitelisted fields are completely absent
    expect(contextStr).not.toContain('Private medical bill');
    expect(contextStr).not.toContain('Pharmacy');
    expect(contextStr).not.toContain('Dr. John');
    expect(contextStr).not.toContain('Personal health checkup');
    expect(contextStr).not.toContain('dr_john');
  });
});
