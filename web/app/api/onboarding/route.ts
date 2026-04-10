import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/onboarding
 * Called when a new user completes the onboarding flow.
 * Creates their Prisma user record (or links existing one) and marks onboarding done.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, businessType, selectedAgents } = body;

  // Check if prisma user already exists (by auth id or email)
  let user = await prisma.user.findUnique({ where: { supabase_auth_id: authUser.id } });

  if (!user && authUser.email) {
    user = await prisma.user.findUnique({ where: { email: authUser.email } });
  }

  if (user) {
    // Link + mark done
    await prisma.user.update({
      where: { id: user.id },
      data: {
        supabase_auth_id: authUser.id,
        name: name || user.name,
        onboarding_completed: true,
      },
    });
  } else {
    // Create brand new user
    user = await prisma.user.create({
      data: {
        email: authUser.email!,
        name: name || authUser.email!.split('@')[0],
        supabase_auth_id: authUser.id,
        onboarding_completed: true,
      },
    });
  }

  return NextResponse.json({ ok: true, userId: user.id });
}
