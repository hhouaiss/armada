import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — do not remove this
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Only this email can access the app during private beta
  const ALLOWED_EMAIL = 'leggo.dblg@gmail.com';

  // Public routes that don't require auth
  const publicPaths = ['/', '/login', '/auth/callback', '/api/auth'];
  const isPublic =
    publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');

  // Block /login for non-whitelisted visitors (redirect to landing)
  if (!user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // If not authenticated and trying to access a protected route → landing
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // If authenticated but not whitelisted → sign out and redirect to landing
  if (user && user.email !== ALLOWED_EMAIL) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // If authenticated (whitelisted) and going to login → redirect to HQ
  if (user && pathname === '/login') {
    const hqUrl = request.nextUrl.clone();
    hqUrl.pathname = '/hq';
    hqUrl.search = '';
    return NextResponse.redirect(hqUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
