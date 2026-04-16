import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // 인증 성공 시 홈으로 리다이렉트
      return NextResponse.redirect(`${origin}/`);
    }
  }

  // 실패 시 로그인 페이지로 리다이렉트 (또는 에러 페이지)
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
