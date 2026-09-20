import { db, AppDb } from './db/client';
import { sql } from 'drizzle-orm';
import { ensureTablesExist } from './db/init';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetIn: number;
}

export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  targetDb: AppDb = db
): Promise<RateLimitResult> {
  await ensureTablesExist(targetDb);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const resetIn = windowStart + windowSeconds - now;

  await targetDb.run(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
  `);

  const rows = await targetDb.all<{ count: number }>(sql`
    SELECT count FROM rate_limits
    WHERE key = ${key} AND window_start = ${windowStart}
  `);

  const currentCount = rows[0]?.count ?? 1;

  if (currentCount > max) {
    return {
      success: false,
      limit: max,
      remaining: 0,
      resetIn,
    };
  }

  return {
    success: true,
    limit: max,
    remaining: max - currentCount,
    resetIn,
  };
}
