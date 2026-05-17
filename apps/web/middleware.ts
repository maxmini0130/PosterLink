import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 로그인 필요 경로
const AUTH_REQUIRED = ['/mypage', '/favorites', '/notifications', '/onboarding', '/posters/request'];
// 관리자 전용 경로
const ADMIN_REQUIRED = ['/admin'];
// 운영자 이상 전용 경로
const OPERATOR_REQUIRED = ['/operator'];
// 온보딩 완료 여부를 체크할 경로 (로그인 사용자 대상)
const ONBOARDING_CHECK = ['/', '/posters', '/favorites', '/notifications', '/mypage'];
// 온보딩 체크에서 제외할 경로 (접두사 매칭)
const ONBOARDING_SKIP = ['/onboarding', '/login', '/signup', '/auth', '/terms', '/privacy', '/api'];

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

  // 비로그인 → 인증 필요 경로 차단
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

  // 로그인 사용자: role + onboarding_completed 한 번에 조회
  const needsRoleCheck =
    ADMIN_REQUIRED.some((p) => pathname.startsWith(p)) ||
    OPERATOR_REQUIRED.some((p) => pathname.startsWith(p));

  const needsOnboardingCheck =
    !ONBOARDING_SKIP.some((p) => pathname.startsWith(p)) &&
    ONBOARDING_CHECK.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p)));

  if (needsRoleCheck || needsOnboardingCheck) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, onboarding_completed')
      .eq('id', user.id)
      .single();

    const role = profile?.role ?? 'user';
    const onboardingDone = profile?.onboarding_completed ?? false;

    // 온보딩 미완료 → /onboarding으로
    if (needsOnboardingCheck && !onboardingDone) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    // 관리자 권한 체크
    if (ADMIN_REQUIRED.some((p) => pathname.startsWith(p))) {
      if (role !== 'admin' && role !== 'super_admin') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    // 운영자 권한 체크
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
