import { NextResponse, type NextRequest } from 'next/server';
import { authorizeUrl, isOAuthConfigured, setState } from '@/lib/youtube-oauth';

/** Starts the consent flow. The `state` value is a one-time CSRF token stored
 *  in an httpOnly cookie and compared on the way back — without it, an
 *  attacker could complete the flow with their own code and bind their YouTube
 *  account to somebody else's session. */
export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json(
      { error: 'YouTube OAuth is not configured on this deployment.' },
      { status: 501 },
    );
  }

  const state = crypto.randomUUID();
  await setState(state);

  const origin = request.nextUrl.origin;
  return NextResponse.redirect(authorizeUrl(origin, state));
}
