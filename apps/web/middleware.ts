import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 인증 필요 경로 (로그인만 확인)
const AUTH_REQUIRED = ['/mypage', '/favorites', '/notifications', '/onboarding'];
// 관리자 전용 경로
const ADMIN_REQUIRED = ['/admin'];
// 운영자 이상 전용 경로
const OPERATOR_REQUIRED = ['/operator'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // 비로그인 → 로그인 필요 경로 차단
  if (!user) {
    const needsAuth =
      AUTH_REQUIRED.some((p) => pathname.startsWith(p)) ||
      ADMIN_REQUIRED.some((p) => pathname.startsWith(p)) ||
      OPERATOR_REQUIRED.some((p) => pathname.startsWith(p));

    if (needsAuth) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // 관리자/운영자 경로 → role 확인 (DB 조회)
  const needsRole =
    ADMIN_REQUIRED.some((p) => pathname.startsWith(p)) ||
    OPERATOR_REQUIRED.some((p) => pathname.startsWith(p));

  if (needsRole) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role ?? 'user';

    if (ADMIN_REQUIRED.some((p) => pathname.startsWith(p))) {
      if (role !== 'admin' && role !== 'super_admin') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    if (OPERATOR_REQUIRED.some((p) => pathname.startsWith(p))) {
      if (role !== 'operator' && role !== 'admin' && role !== 'super_admin') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
