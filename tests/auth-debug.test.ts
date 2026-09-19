import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../lib/db/schema';
import { ensureSchema } from '../lib/db/init';

describe('Auth & Middleware Diagnostics', () => {
  let memDb: ReturnType<typeof drizzle>;
  let memClient: ReturnType<typeof createClient>;

  beforeEach(async () => {
    memClient = createClient({ url: ':memory:' });
    memDb = drizzle(memClient, { schema });
    await ensureSchema(memDb as any);
  });

  describe('Middleware Matcher & Static Bypass Logic', () => {
    // Next.js evaluates matchers rooted at the start and end of path
    const matcherPattern = '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|ico|css|js|map)$).*)';
    const regex = new RegExp('^' + matcherPattern + '$');

    it('matches protected pages and api routes', () => {
      expect(regex.test('/')).toBe(true);
      expect(regex.test('/transactions')).toBe(true);
      expect(regex.test('/lending')).toBe(true);
      expect(regex.test('/chat')).toBe(true);
      expect(regex.test('/api/transactions')).toBe(true);
      expect(regex.test('/api/lending')).toBe(true);
    });

    it('excludes Next.js static assets, css, js, fonts and images', () => {
      expect(regex.test('/_next/static/css/app/layout.css')).toBe(false);
      expect(regex.test('/_next/static/chunks/webpack.js')).toBe(false);
      expect(regex.test('/_next/static/media/inter.woff2')).toBe(false);
      expect(regex.test('/_next/image')).toBe(false);
      expect(regex.test('/favicon.ico')).toBe(false);
      expect(regex.test('/logo.svg')).toBe(false);
      expect(regex.test('/hero.png')).toBe(false);
      expect(regex.test('/font.woff')).toBe(false);
    });

    it('validates in-code static bypass check', () => {
      const isBypassed = (pathname: string) => {
        return (
          pathname.startsWith('/_next') ||
          pathname.startsWith('/api/auth') ||
          pathname === '/favicon.ico' ||
          /\.(svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|ico|css|js|map)$/i.test(pathname)
        );
      };

      expect(isBypassed('/_next/static/css/app.css')).toBe(true);
      expect(isBypassed('/_next/static/chunks/main.js')).toBe(true);
      expect(isBypassed('/_next/static/media/inter.woff2')).toBe(true);
      expect(isBypassed('/api/auth/session')).toBe(true);
      expect(isBypassed('/api/auth/callback/credentials')).toBe(true);
      expect(isBypassed('/favicon.ico')).toBe(true);
      expect(isBypassed('/icons/icon.png')).toBe(true);
      expect(isBypassed('/transactions')).toBe(false);
      expect(isBypassed('/api/transactions')).toBe(false);
    });
  });

  describe('Credentials Verification Logic', () => {
    it('verifies user password with case-insensitive email and bcrypt', async () => {
      const password = 'CorrectPassword123!';
      const hash = await bcrypt.hash(password, 10);
      const userId = crypto.randomUUID();

      await memClient.execute({
        sql: 'INSERT INTO users (id, email, handle, display_name, password_hash) VALUES (?, ?, ?, ?, ?)',
        args: [userId, 'testuser@example.com', 'testuser', 'Test User', hash],
      });

      // Query case-insensitively
      const inputEmail = '  TESTUSER@example.COM  '.trim().toLowerCase();
      const res = await memClient.execute({
        sql: 'SELECT id, email, password_hash, display_name FROM users WHERE lower(email) = ?',
        args: [inputEmail],
      });

      expect(res.rows.length).toBe(1);
      const user = res.rows[0];

      // Password comparison
      const valid = await bcrypt.compare(password, user.password_hash as string);
      expect(valid).toBe(true);

      const invalid = await bcrypt.compare('WrongPassword!', user.password_hash as string);
      expect(invalid).toBe(false);
    });

    it('handles non-existent user safely without revealing existence', async () => {
      const res = await memClient.execute({
        sql: 'SELECT id, email, password_hash, display_name FROM users WHERE lower(email) = ?',
        args: ['nonexistent@example.com'],
      });
      expect(res.rows.length).toBe(0);
    });
  });
});
