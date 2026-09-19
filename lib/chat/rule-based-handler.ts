import { getUserTransactions } from '../db/queries/transactions';

import { db, AppDb } from '../db/client';

export interface TimeframeFilter {
  label: string;
  startDate: Date | null;
}

// Map common aliases/typos to standard categories
const CATEGORY_MAP: Record<string, string> = {
  food: 'Food',
  groceries: 'Food',
  grocery: 'Food',
  dining: 'Food',
  restaurant: 'Food',
  snacks: 'Food',
  meals: 'Food',
  eating: 'Food',
  swiggy: 'Food',
  zomato: 'Food',

  transport: 'Transport',
  travel: 'Transport',
  commute: 'Transport',
  cab: 'Transport',
  uber: 'Transport',
  ola: 'Transport',
  auto: 'Transport',
  metro: 'Transport',
  bus: 'Transport',
  petrol: 'Transport',
  fuel: 'Transport',
  flight: 'Transport',
  train: 'Transport',

  shopping: 'Shopping',
  clothes: 'Shopping',
  clothing: 'Shopping',
  amazon: 'Shopping',
  flipkart: 'Shopping',
  myntra: 'Shopping',
  electronics: 'Shopping',

  subscription: 'Subscriptions',
  subscriptions: 'Subscriptions',
  netflix: 'Subscriptions',
  spotify: 'Subscriptions',
  prime: 'Subscriptions',
  hotstar: 'Subscriptions',
  youtube: 'Subscriptions',

  rent: 'Rent',
  hostel: 'Rent',
  pg: 'Rent',
  accommodation: 'Rent',

  other: 'Other',
  misc: 'Other',
  miscellaneous: 'Other',
  bills: 'Other',
  utility: 'Other',
  utilities: 'Other',
};

/**
 * Extracts timeframe from user message, default is current month.
 */
function parseTimeframe(text: string): TimeframeFilter {
  const lower = text.toLowerCase();
  const now = new Date();

  if (lower.includes('today')) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { label: 'today', startDate: start };
  }

  if (
    lower.includes('this week') ||
    lower.includes('past week') ||
    lower.includes('last 7 days') ||
    lower.includes('weekly')
  ) {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { label: 'this week', startDate: start };
  }

  if (
    lower.includes('recently') ||
    lower.includes('past 30 days') ||
    lower.includes('last 30 days') ||
    lower.includes('last month')
  ) {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { label: 'recently (last 30 days)', startDate: start };
  }

  if (
    lower.includes('all time') ||
    lower.includes('overall') ||
    lower.includes('total so far') ||
    lower.includes('everything')
  ) {
    return { label: 'overall', startDate: null };
  }

  // Default: current month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { label: 'this month', startDate: startOfMonth };
}

/**
 * 1. Pattern: Savings goal division
 * Examples:
 * - "I want to save ₹5000 this month, how much per day"
 * - "I want to save 3000 this month, how much daily"
 * - "How much to save per day to reach 10000 goal"
 * - "save 6000 this month how much per day"
 */
function matchSavingsGoal(question: string): { goal: number } | null {
  const lower = question.toLowerCase();
  if (
    !lower.includes('save') &&
    !lower.includes('saving') &&
    !lower.includes('goal')
  ) {
    return null;
  }

  const goalMatch =
    lower.match(
      /(?:save|saving|goal)\s*(?:of\s*)?(?:₹|rs\.?|inr\s*)?([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i
    ) ||
    lower.match(
      /(?:₹|rs\.?|inr\s*)([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:goal|savings?)/i
    );

  if (!goalMatch) return null;

  const rawAmount = goalMatch[1].replace(/,/g, '');
  const goal = parseFloat(rawAmount);
  if (isNaN(goal) || goal <= 0) return null;

  return { goal };
}

/**
 * 2. Pattern: Category spend total
 * Examples:
 * - "How much did I spend on food this month?"
 * - "What is my transport spend this week?"
 * - "How much on shopping recently?"
 * - "total groceries expenses"
 */
function matchCategorySpend(
  question: string
): { category: string; matchedWord: string } | null {
  const lower = question.toLowerCase();

  // Look for spending intent
  const hasSpendIntent =
    lower.includes('spend') ||
    lower.includes('spent') ||
    lower.includes('expense') ||
    lower.includes('expenses') ||
    lower.includes('cost') ||
    lower.includes('how much on') ||
    lower.includes('how much for');

  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    // Word boundary regex
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(lower)) {
      if (hasSpendIntent || lower.startsWith('how much') || lower.includes('total')) {
        return { category, matchedWord: key };
      }
    }
  }

  return null;
}

/**
 * 3. Pattern: Income / source-based query
 * Examples:
 * - "How much did I receive from internship?"
 * - "How much income from stipend this month?"
 * - "How much did I get from pocket money?"
 * - "earnings from freelance"
 */
function matchIncomeSource(question: string): { source: string } | null {
  // Clean trailing question mark or punctuation
  const clean = question.replace(/[?!.]+$/, '').trim();
  const lower = clean.toLowerCase();

  const timeframeKeywords = [
    'this month',
    'this week',
    'recently',
    'today',
    'yesterday',
    'overall',
    'all time',
    'past month',
    'past week',
  ];

  const incomePatterns = [
    /(?:receive|received|get|got|earned|earn|made|income)\s+from\s+([a-z0-9\s_-]+?)(?:\s+(?:this month|this week|recently|in total|today|overall))?$/i,
    /(?:how much|total)\s+(?:did\s+)?([a-z0-9\s_-]+?)\s+(?:pay|give|send)(?:\s+(?:this month|this week|recently|today))?$/i,
    /(?:income|earnings?|money)\s+from\s+([a-z0-9\s_-]+?)(?:\s+(?:this month|this week|recently|today))?$/i,
  ];

  for (const pattern of incomePatterns) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const source = match[1].trim();
      // Avoid matching generic stop words, timeframe terms, or category names
      if (
        source &&
        source.length > 2 &&
        !timeframeKeywords.includes(source) &&
        !['i', 'money', 'cash', 'income', 'food', 'transport', 'shopping', 'rent', 'other'].includes(
          source
        )
      ) {
        return { source };
      }
    }
  }

  return null;
}

/**
 * 4. Pattern: General spend / income total
 * Examples:
 * - "How much did I spend this month?"
 * - "Total expenses this week"
 * - "How much did I earn this month?"
 * - "Total income recently"
 */
function matchGeneralSpendOrIncome(
  question: string
): { type: 'expense' | 'income' } | null {
  const lower = question.toLowerCase();

  const isIncome =
    lower.includes('earn') ||
    lower.includes('earned') ||
    lower.includes('income') ||
    lower.includes('received') ||
    lower.includes('salary') ||
    lower.includes('inflow');

  const isExpense =
    lower.includes('spend') ||
    lower.includes('spent') ||
    lower.includes('expense') ||
    lower.includes('expenses') ||
    lower.includes('outflow') ||
    lower.includes('burn');

  if (isIncome && !isExpense) {
    return { type: 'income' };
  }

  if (isExpense && !isIncome) {
    return { type: 'expense' };
  }

  return null;
}

/**
 * Main Rule-Based Query Handler
 * Evaluates the question against patterns and returns a structured response string, or null if no rule matches.
 */
export async function handleRuleBasedChatQuery(
  userId: string,
  question: string,
  targetDb: AppDb = db
): Promise<string | null> {
  const trimmed = question.trim();
  if (!trimmed) return null;

  // 1. Check Savings Goal Division
  const savingsGoal = matchSavingsGoal(trimmed);
  if (savingsGoal) {
    const allTxns = await getUserTransactions(userId, targetDb);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    const currentDay = now.getDate();
    const remainingDays = Math.max(1, daysInMonth - currentDay + 1);

    const monthTxns = allTxns.filter((t) => new Date(t.date) >= startOfMonth);
    const totalSpent = monthTxns
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = monthTxns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const goal = savingsGoal.goal;
    const dailyNeeded = Math.ceil(goal / remainingDays);
    const weeklyNeeded = Math.ceil(goal / Math.max(1, remainingDays / 7));

    if (totalIncome > 0 && totalSpent > totalIncome) {
      return `You've spent ₹${totalSpent.toLocaleString('en-IN')} and earned ₹${totalIncome.toLocaleString('en-IN')} this month (expenses exceed income by ₹${(totalSpent - totalIncome).toLocaleString('en-IN')}). With ${remainingDays} days left, save about ₹${dailyNeeded.toLocaleString('en-IN')} per day to hit your ₹${goal.toLocaleString('en-IN')} target, and consider reducing discretionary spending.`;
    }

    if (totalIncome > 0 && totalIncome - totalSpent < goal && remainingDays <= 5) {
      const remainingSavings = totalIncome - totalSpent;
      return `You have saved ₹${Math.max(0, remainingSavings).toLocaleString('en-IN')} so far this month (earned ₹${totalIncome.toLocaleString('en-IN')}, spent ₹${totalSpent.toLocaleString('en-IN')}). With only ${remainingDays} days left, you need about ₹${dailyNeeded.toLocaleString('en-IN')}/day to reach your goal of ₹${goal.toLocaleString('en-IN')}.`;
    }

    return `You've spent ₹${totalSpent.toLocaleString('en-IN')} so far this month with ${remainingDays} day(s) remaining. To reach your savings goal of ₹${goal.toLocaleString('en-IN')}, aim to save about ₹${dailyNeeded.toLocaleString('en-IN')} per day (or ~₹${weeklyNeeded.toLocaleString('en-IN')} per week).`;
  }

  // 2. Check Category Spend Query
  const categoryMatch = matchCategorySpend(trimmed);
  if (categoryMatch) {
    const timeframe = parseTimeframe(trimmed);
    const allTxns = await getUserTransactions(userId, targetDb);

    const filtered = allTxns.filter((t) => {
      if (t.type !== 'expense') return false;
      if (t.category.toLowerCase() !== categoryMatch.category.toLowerCase())
        return false;
      if (timeframe.startDate && new Date(t.date) < timeframe.startDate)
        return false;
      return true;
    });

    const total = filtered.reduce((sum, t) => sum + t.amount, 0);

    if (filtered.length === 0) {
      return `No expenses logged in ${categoryMatch.category} ${timeframe.label} yet.`;
    }

    return `You've spent ₹${total.toLocaleString('en-IN')} on ${categoryMatch.category} ${timeframe.label} across ${filtered.length} transaction(s).`;
  }

  // 3. Check Income Source Query
  const incomeSource = matchIncomeSource(trimmed);
  if (incomeSource) {
    const timeframe = parseTimeframe(trimmed);
    const allTxns = await getUserTransactions(userId, targetDb);
    const kw = incomeSource.source.toLowerCase();

    const filtered = allTxns.filter((t) => {
      if (t.type !== 'income') return false;
      const desc = (t.description || '').toLowerCase();
      if (!desc.includes(kw)) return false;
      if (timeframe.startDate && new Date(t.date) < timeframe.startDate)
        return false;
      return true;
    });

    const total = filtered.reduce((sum, t) => sum + t.amount, 0);

    if (filtered.length === 0) {
      return `No income found matching "${incomeSource.source}" ${timeframe.label}. Check the description spelling in your transaction list.`;
    }

    return `You've received ₹${total.toLocaleString('en-IN')} from "${incomeSource.source}" ${timeframe.label} across ${filtered.length} transaction(s).`;
  }

  // 4. Check General Spend / Income Query
  const generalMatch = matchGeneralSpendOrIncome(trimmed);
  if (generalMatch) {
    const timeframe = parseTimeframe(trimmed);
    const allTxns = await getUserTransactions(userId, targetDb);

    const filtered = allTxns.filter((t) => {
      if (t.type !== generalMatch.type) return false;
      if (timeframe.startDate && new Date(t.date) < timeframe.startDate)
        return false;
      return true;
    });

    const total = filtered.reduce((sum, t) => sum + t.amount, 0);

    if (generalMatch.type === 'expense') {
      if (filtered.length === 0) {
        return `You have no recorded expenses ${timeframe.label}.`;
      }
      return `You've spent ₹${total.toLocaleString('en-IN')} ${timeframe.label} across ${filtered.length} expense(s).`;
    } else {
      if (filtered.length === 0) {
        return `You have no recorded income ${timeframe.label}.`;
      }
      return `You've earned ₹${total.toLocaleString('en-IN')} ${timeframe.label} across ${filtered.length} income transaction(s).`;
    }
  }

  return null;
}
