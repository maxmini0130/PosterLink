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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: naverUser.email,
    options: {
      data: { full_name: naverUser.name, avatar_url: naverUser.profile_image, provider: 'naver' },
      redirectTo: `${BASE_URL}/auth/callback`,
    },
  });

  if (linkError || !linkData?.properties?.action_link) {
    // 유저 없으면 생성 후 재시도
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
      const e1 = encodeURIComponent(linkError?.message ?? 'no_action_link');
      const e2 = encodeURIComponent(retryError?.message ?? 'no_action_link_retry');
      const e3 = encodeURIComponent(createError?.message ?? 'ok');
      return NextResponse.redirect(`${BASE_URL}/login?error=login_failed&e1=${e1}&e2=${e2}&create=${e3}`);
    }
    return serverSideVerify(retryData.properties.action_link, BASE_URL);
  }

  return serverSideVerify(linkData.properties.action_link, BASE_URL);
}

async function serverSideVerify(actionLink: string, baseUrl: string): Promise<NextResponse> {
  // action_link를 서버에서 fetch해서 Location 헤더의 토큰을 추출
  // 브라우저 hash fragment 유실 문제 완전 회피
  const verifyRes = await fetch(actionLink, { redirect: 'manual' });
  const location = verifyRes.headers.get('location') ?? '';

  const status = verifyRes.status;
  const hashIndex = location.indexOf('#');
  if (hashIndex === -1) {
    const loc = encodeURIComponent(location.slice(0, 100));
    return NextResponse.redirect(`${baseUrl}/login?error=no_hash_in_redirect&status=${status}&loc=${loc}`);
  }

  const fragment = new URLSearchParams(location.substring(hashIndex + 1));
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');

  if (!accessToken || !refreshToken) {
    const fragDebug = encodeURIComponent(location.substring(hashIndex + 1, hashIndex + 120));
    return NextResponse.redirect(`${baseUrl}/login?error=no_tokens_in_fragment&frag=${fragDebug}`);
  }

  // query param으로 전달 (hash fragment 아님)
  const callbackUrl = new URL(`${baseUrl}/auth/callback`);
  callbackUrl.searchParams.set('naver_at', accessToken);
  callbackUrl.searchParams.set('naver_rt', refreshToken);
  const response = NextResponse.redirect(callbackUrl.toString());
  response.cookies.delete('naver_oauth_state');
  return response;
}
