import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/hq';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const authUser = data.user;

  // Auto-link or auto-create the Prisma user record
  let prismaUser = await prisma.user.findUnique({
    where: { supabase_auth_id: authUser.id },
  });

  if (!prismaUser && authUser.email) {
    // Check if a user with this email already exists (admin pre-seeded)
    prismaUser = await prisma.user.findUnique({ where: { email: authUser.email } });
    if (prismaUser) {
      // Link this auth identity to the existing Prisma user
      await prisma.user.update({
        where: { id: prismaUser.id },
        data: { supabase_auth_id: authUser.id },
      });
    }
  }

  if (!prismaUser) {
    // Brand new user — send to onboarding
    response.headers.set('Location', `${origin}/onboarding`);
    return response;
  }

  // Check if onboarding is complete
  const needsOnboarding = !(prismaUser as any).onboarding_completed;
  if (needsOnboarding) {
    response.headers.set('Location', `${origin}/onboarding`);
    return response;
  }

  return response;
}
