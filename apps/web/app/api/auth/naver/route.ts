import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const _rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://posterlink.co.kr';
const BASE_URL = _rawUrl.startsWith('http') ? _rawUrl : `https://${_rawUrl}`;

export async function GET() {
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${BASE_URL}/login?error=naver_not_configured`);
  }

  const state = crypto.randomUUID();
  const redirectUri = `${BASE_URL}/api/auth/naver/callback`;

  const url = new URL('https://nid.naver.com/oauth2.0/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set('naver_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });

  return response;
}
