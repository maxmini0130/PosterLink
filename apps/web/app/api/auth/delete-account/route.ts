import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function DELETE() {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 카카오 연동 해제 (KAKAO_ADMIN_KEY 설정된 경우)
  const provider = user.app_metadata?.provider;
  if (provider === 'kakao' && process.env.KAKAO_ADMIN_KEY) {
    const kakaoId = user.identities?.find(i => i.provider === 'kakao')?.id;
    if (kakaoId) {
      await fetch('https://kapi.kakao.com/v1/user/unlink', {
        method: 'POST',
        headers: {
          'Authorization': `KakaoAK ${process.env.KAKAO_ADMIN_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `target_id_type=user_id&target_id=${kakaoId}`,
      }).catch(() => null); // 실패해도 탈퇴는 계속 진행
    }
  }

  // auth.users 삭제 → profiles CASCADE 삭제 → posters.created_by SET NULL (FK)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
