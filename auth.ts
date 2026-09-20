import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { rawClient } from './lib/db/client';
import { ensureTablesExist } from './lib/db/init';
import { rateLimit } from './lib/rate-limit';

const DUMMY_HASH = '$2a$12$e8Ym1/Yd8jJ.bX1R.q8OeeYhH7fR3p7o7Yv9Uj7e3o8u.cK9aH7y2';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.warn('[AUTH] Missing email or password in authorize credentials');
          return null;
        }

        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        await ensureTablesExist();

        const rl = await rateLimit(`login:${email}`, 5, 60);
        if (!rl.success) {
          console.warn(`[AUTH] Rate limit triggered for email: ${email}`);
          return null;
        }

        const res = await rawClient.execute({
          sql: 'SELECT id, email, password_hash, display_name FROM users WHERE lower(email) = ?',
          args: [email],
        });

        const user = res.rows[0];
        if (!user) {
          console.warn(`[AUTH] User not found for email: ${email}`);
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password_hash as string);
        if (!isValid) {
          console.warn(`[AUTH] Invalid password for user: ${user.id}`);
          return null;
        }

        return {
          id: user.id as string,
          email: user.email as string,
          name: user.display_name as string,
        };
      },
    }),
  ],
});
