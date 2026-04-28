import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const _rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://posterlink.kr';
const BASE_URL = _rawUrl.startsWith('http') ? _rawUrl : `https://${_rawUrl}`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const storedState = request.cookies.get('naver_oauth_state')?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${BASE_URL}/login?error=invalid_state`);
  }

  // Naver OAuth: exchange authorization code for access token
  const redirectUri = `${BASE_URL}/api/auth/naver/callback`;
  const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  tokenUrl.searchParams.set('client_id', process.env.NAVER_CLIENT_ID!);
  tokenUrl.searchParams.set('client_secret', process.env.NAVER_CLIENT_SECRET!);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('state', state);
  tokenUrl.searchParams.set('redirect_uri', redirectUri);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(`${BASE_URL}/login?error=naver_token_failed`);
  }

  // Get Naver user profile
  const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profileData = await profileRes.json();
  const naverUser = profileData.response as {
    id: string;
    email: string;
    name: string;
    nickname?: string;
    profile_image?: string;
  } | undefined;

  if (!naverUser?.email) {
    return NextResponse.redirect(`${BASE_URL}/login?error=naver_email_required`);
  }

  // Supabase admin client (server-side only — uses service role key)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // generateLink: 유저 없으면 자동 생성, 있으면 magic link만 생성
  // createUser를 먼저 호출하면 내부 OTP를 덮어쓸 수 있으므로 제거
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: naverUser.email,
    options: {
      data: { full_name: naverUser.name, avatar_url: naverUser.profile_image, provider: 'naver' },
      redirectTo: `${BASE_URL}/auth/callback`,
    },
  });

  if (linkError || !linkData?.properties?.action_link) {
    const e1 = encodeURIComponent(linkError?.message ?? 'no_action_link');
    // 유저가 없어서 실패한 경우 먼저 생성 후 재시도
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: naverUser.email,
      email_confirm: true,
      user_metadata: { full_name: naverUser.name, avatar_url: naverUser.profile_image, provider: 'naver' },
    });
    const { data: retryData, error: retryError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: naverUser.email,
      options: {
        data: { full_name: naverUser.name, avatar_url: naverUser.profile_image, provider: 'naver' },
        redirectTo: `${BASE_URL}/auth/callback`,
      },
    });
    if (retryError || !retryData?.properties?.action_link) {
      const e2 = encodeURIComponent(retryError?.message ?? 'no_action_link_retry');
      const e3 = encodeURIComponent(createError?.message ?? 'ok');
      return NextResponse.redirect(`${BASE_URL}/login?error=login_failed&e1=${e1}&e2=${e2}&create=${e3}`);
    }
    const response = NextResponse.redirect(retryData.properties.action_link);
    response.cookies.delete('naver_oauth_state');
    return response;
  }

  // 디버그: 리다이렉트 체인 대신 중간 페이지에서 직접 클릭하도록 변경
  const bridgeUrl = new URL(`${BASE_URL}/auth/naver-bridge`);
  bridgeUrl.searchParams.set('al', encodeURIComponent(linkData.properties.action_link));
  const response = NextResponse.redirect(bridgeUrl.toString());
  response.cookies.delete('naver_oauth_state');
  return response;
}
