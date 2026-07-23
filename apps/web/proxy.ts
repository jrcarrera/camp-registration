import { NextResponse, type NextRequest } from 'next/server';

const publicPrefixes = [
  '/sign-in',
  '/recover-account',
  '/accept-invite',
  '/o/',
  '/api/',
  '/_next/',
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (process.env.LOCAL_AUTH_ENABLED === 'true') {
    return NextResponse.next();
  }
  if (
    pathname === '/health' ||
    pathname === '/favicon.ico' ||
    publicPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }
  if (!request.cookies.get('camp_session')) {
    const signIn = new URL('/sign-in', request.url);
    signIn.searchParams.set('returnTo', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
