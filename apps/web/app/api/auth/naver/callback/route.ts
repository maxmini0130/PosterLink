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

  if (linkError || !linkData?.properties?.email_otp) {
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
    if (retryError || !retryData?.properties?.email_otp) {
      const e1 = encodeURIComponent(linkError?.message ?? 'no_otp');
      const e2 = encodeURIComponent(retryError?.message ?? 'no_otp_retry');
      const e3 = encodeURIComponent(createError?.message ?? 'ok');
      return NextResponse.redirect(`${BASE_URL}/login?error=login_failed&e1=${e1}&e2=${e2}&create=${e3}`);
    }
    const callbackUrl = new URL(`${BASE_URL}/auth/callback`);
    callbackUrl.searchParams.set('naver_email', naverUser.email);
    callbackUrl.searchParams.set('naver_otp', retryData.properties.email_otp);
    callbackUrl.searchParams.set('type', 'magiclink');
    const response = NextResponse.redirect(callbackUrl.toString());
    response.cookies.delete('naver_oauth_state');
    return response;
  }

  // email_otp를 query param으로 전달 — hash fragment 유실 문제 없음
  const callbackUrl = new URL(`${BASE_URL}/auth/callback`);
  callbackUrl.searchParams.set('naver_email', naverUser.email);
  callbackUrl.searchParams.set('naver_otp', linkData.properties.email_otp);
  callbackUrl.searchParams.set('type', 'magiclink');
  const response = NextResponse.redirect(callbackUrl.toString());
  response.cookies.delete('naver_oauth_state');
  return response;
}
