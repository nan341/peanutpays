import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const PUBLIC_PAGES = ['/login', '/signup', '/privacy', '/terms'];

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  // Unconditional pass-through for static files, Next.js internals, and auth endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|ico|css|js|map)$/i)
  ) {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth?.user;
  const isApiRoute = pathname.startsWith('/api');
  const isPublicPage = PUBLIC_PAGES.includes(pathname) || PUBLIC_PAGES.some((p) => pathname.startsWith(`${p}/`));

  if (isApiRoute) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isLoggedIn && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/', nextUrl));
  }

  if (isPublicPage) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|ico|css|js|map)$).*)',
  ],
};

