import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://posterlink.co.kr';

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

  // Ensure user exists in Supabase (no-op if already registered)
  await supabaseAdmin.auth.admin.createUser({
    email: naverUser.email,
    email_confirm: true,
    user_metadata: {
      full_name: naverUser.name,
      avatar_url: naverUser.profile_image,
      provider: 'naver',
    },
  });

  // Generate one-time sign-in link
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: naverUser.email,
    options: {
      data: { full_name: naverUser.name, avatar_url: naverUser.profile_image },
      redirectTo: `${BASE_URL}/auth/callback`,
    },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.redirect(`${BASE_URL}/login?error=login_failed`);
  }

  const response = NextResponse.redirect(linkData.properties.action_link);
  response.cookies.delete('naver_oauth_state');
  return response;
}
