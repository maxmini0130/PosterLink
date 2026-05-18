import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });

  request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
    .forEach((cookie) => {
      response.cookies.set(cookie.name, '', {
        path: '/',
        maxAge: 0,
      });
    });

  return response;
}
