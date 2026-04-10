import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Get the authenticated Prisma user from a Next.js API route request.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Read-only in API routes — session refresh handled by middleware
        },
      },
    }
  );

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  // Look up by supabase_auth_id first
  let user = await prisma.user.findUnique({
    where: { supabase_auth_id: authUser.id },
  });

  // Fallback: match by email (first login before supabase_auth_id is set)
  if (!user && authUser.email) {
    user = await prisma.user.findUnique({ where: { email: authUser.email } });
    if (user) {
      // Permanently link this Supabase Auth user to the Prisma user
      user = await prisma.user.update({
        where: { id: user.id },
        data: { supabase_auth_id: authUser.id },
      });
    }
  }

  return user;
}

/**
 * Get the current user from server components (uses cookie store).
 */
export async function getCurrentUserServer() {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  let user = await prisma.user.findUnique({
    where: { supabase_auth_id: authUser.id },
  });

  if (!user && authUser.email) {
    user = await prisma.user.findUnique({ where: { email: authUser.email } });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { supabase_auth_id: authUser.id },
      });
    }
  }

  return user;
}
