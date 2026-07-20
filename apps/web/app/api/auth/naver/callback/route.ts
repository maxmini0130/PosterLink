import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { getAppOrigin } from '../../../../../lib/siteUrl';

const BASE_URL = getAppOrigin();

async function derivePassword(naverId: string): Promise<string> {
  const secret = process.env.NAVER_CLIENT_SECRET ?? '';
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(`naver:${naverId}`);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function findAuthUserByEmail(
  supabaseAdmin: any,
  email: string
) {
  const normalizedEmail = email.toLowerCase();
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw error;
    }

    const users = (data.users ?? []) as Array<{ id: string; email?: string | null }>;
    const matchedUser = users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail
    );
    if (matchedUser) {
      return matchedUser;
    }

    const nextPage = 'nextPage' in data ? data.nextPage : null;
    const lastPage = 'lastPage' in data ? data.lastPage : page;

    if (!nextPage || page >= lastPage) {
      return null;
    }

    page = nextPage;
  }
}

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

  // 네이버 user ID로 결정론적 비밀번호 파생 — OTP/magic link 완전 우회
  const password = await derivePassword(naverUser.id);
  const userMeta = { full_name: naverUser.name, avatar_url: naverUser.profile_image, provider: 'naver' };

  // 유저 존재 여부 확인
  const existingUser = await findAuthUserByEmail(supabaseAdmin, naverUser.email);
  if (existingUser) {
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password,
      user_metadata: userMeta,
    });
    if (updateErr) {
      return NextResponse.redirect(`${BASE_URL}/login?error=update_user_failed&msg=${encodeURIComponent(updateErr.message)}`);
    }
  } else {
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: naverUser.email,
      password,
      email_confirm: true,
      user_metadata: userMeta,
    });
    if (createErr) {
      return NextResponse.redirect(`${BASE_URL}/login?error=create_user_failed&msg=${encodeURIComponent(createErr.message)}`);
    }
  }

  // 서버에서 직접 signInWithPassword — PKCE 불필요, OTP 레이트리밋 없음
  const supabaseSignIn = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
  const { data: signInData, error: signInError } = await supabaseSignIn.auth.signInWithPassword({
    email: naverUser.email,
    password,
  });

  if (signInError || !signInData.session) {
    return NextResponse.redirect(`${BASE_URL}/login?error=signin_failed&msg=${encodeURIComponent(signInError?.message ?? 'no_session')}`);
  }

  const pendingCookies = new Map<string, { value: string; options: Record<string, unknown> }>();
  const supabaseSession = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll() {
          const merged = new Map(request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]));
          pendingCookies.forEach(({ value }, name) => merged.set(name, value));
          return Array.from(merged.entries()).map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.set(name, { value, options });
          });
        },
      },
    }
  );

  const { error: sessionError } = await supabaseSession.auth.setSession({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  });

  if (sessionError) {
    return NextResponse.redirect(
      `${BASE_URL}/login?error=set_session_failed&msg=${encodeURIComponent(sessionError.message)}`
    );
  }

  const userId = signInData.session.user.id;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, primary_region_id')
    .eq('id', userId)
    .single();

  let nextUrl = `${BASE_URL}/`;
  if (!profile || !profile.primary_region_id) {
    const { error: upsertError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: userId,
        nickname: naverUser.email.split('@')[0] ?? 'user',
        role: 'user',
      },
      { onConflict: 'id' }
    );
    if (upsertError) {
      return NextResponse.redirect(
        `${BASE_URL}/login?error=auth_callback_failed&msg=${encodeURIComponent(upsertError.message)}`
      );
    }
    nextUrl = `${BASE_URL}/onboarding`;
  }

  const response = NextResponse.redirect(nextUrl);
  pendingCookies.forEach(({ value, options }, name) => {
    response.cookies.set(name, value, options);
  });
  response.cookies.delete('naver_oauth_state');
  return response;
}
