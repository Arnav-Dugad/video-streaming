import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCode, persistTokens, takeState } from '@/lib/youtube-oauth';

/** Where the viewer lands after consent, with a plain-language result. */
function back(origin: string, status: string) {
  return NextResponse.redirect(`${origin}/profile?youtube=${status}`);
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;

  // The consent screen's own cancel button arrives here as access_denied.
  const error = params.get('error');
  if (error) return back(origin, error === 'access_denied' ? 'cancelled' : 'failed');

  const code = params.get('code');
  const state = params.get('state');
  const expected = await takeState();

  // Single-use, and must match. A missing cookie means the flow did not start
  // here — treat it exactly like a mismatch.
  if (!code || !state || !expected || state !== expected) {
    return back(origin, 'invalid');
  }

  try {
    const tokens = await exchangeCode(code, origin);
    await persistTokens(tokens);
    return back(origin, 'connected');
  } catch (err) {
    console.error('[youtube-oauth] exchange failed', (err as Error).message);
    return back(origin, 'failed');
  }
}
