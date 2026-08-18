import 'server-only';

import { cookies } from 'next/headers';

/* ==========================================================================
   YouTube OAuth.

   Entirely optional. PRISM's own library — follows, likes, playlists — is
   Firestore-backed and works without ever touching this. Connecting a YouTube
   account adds the things only Google can authorise: reading the viewer's real
   subscriptions, subscribing on their behalf, and posting comments.

   Two things worth knowing before enabling it:

   1. The scopes below are *sensitive*. Google requires app verification before
      an unverified project may serve more than 100 users, and until it is
      verified every user sees an "unverified app" interstitial. That is why
      this is opt-in from settings rather than part of signing in.
   2. Tokens never reach the browser. They live in httpOnly cookies and are
      only ever read server-side, so a script injected into the page cannot
      exfiltrate a refresh token.
   ========================================================================== */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** Read-only covers subscriptions and playlists; force-ssl is what allows
 *  writing — subscribing, and posting a comment. */
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

const ACCESS_COOKIE = 'yt_access';
const REFRESH_COOKIE = 'yt_refresh';
const EXPIRY_COOKIE = 'yt_expires';
const STATE_COOKIE = 'yt_state';

export function isOAuthConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_OAUTH_CLIENT_ID && process.env.YOUTUBE_OAUTH_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return `${origin}/api/youtube/callback`;
}

/* ------------------------------ the flow -------------------------------- */

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES,
    // Both are required to receive a refresh token. Without prompt=consent,
    // Google issues one only on a user's very first authorisation, so anyone
    // reconnecting would silently end up with a session that dies in an hour.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return data;
}

async function refresh(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });

  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Token refresh failed');
  }
  return data;
}

/* ----------------------------- cookie store ----------------------------- */

const SECURE = process.env.NODE_ENV === 'production';

const BASE_COOKIE = {
  httpOnly: true,
  secure: SECURE,
  // Lax rather than Strict: the OAuth callback is a top-level navigation from
  // Google, and Strict would drop the cookies on arrival.
  sameSite: 'lax' as const,
  path: '/',
};

export async function persistTokens(tokens: TokenResponse): Promise<void> {
  const jar = await cookies();
  const expiresAt = Date.now() + (tokens.expires_in - 60) * 1000;

  jar.set(ACCESS_COOKIE, tokens.access_token, { ...BASE_COOKIE, maxAge: tokens.expires_in });
  jar.set(EXPIRY_COOKIE, String(expiresAt), { ...BASE_COOKIE, maxAge: 60 * 60 * 24 * 180 });

  // Google omits the refresh token on a refresh response; keeping the existing
  // one is correct, and overwriting with undefined would log the user out.
  if (tokens.refresh_token) {
    jar.set(REFRESH_COOKIE, tokens.refresh_token, { ...BASE_COOKIE, maxAge: 60 * 60 * 24 * 180 });
  }
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, EXPIRY_COOKIE, STATE_COOKIE]) {
    jar.delete(name);
  }
}

export async function setState(state: string): Promise<void> {
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, { ...BASE_COOKIE, maxAge: 600 });
}

export async function takeState(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(STATE_COOKIE)?.value ?? null;
  jar.delete(STATE_COOKIE);
  return value;
}

export async function isConnected(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(REFRESH_COOKIE)?.value);
}

/**
 * A usable access token, refreshing first if the stored one is spent.
 * Returns null when the viewer has not connected an account — callers treat
 * that as "the feature is unavailable", never as an error.
 */
export async function accessToken(): Promise<string | null> {
  if (!isOAuthConfigured()) return null;

  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const expiresAt = Number(jar.get(EXPIRY_COOKIE)?.value ?? 0);

  if (access && expiresAt > Date.now()) return access;

  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;

  try {
    const tokens = await refresh(refreshToken);
    await persistTokens(tokens);
    return tokens.access_token;
  } catch {
    // A refresh token is revoked when the user removes the app in their Google
    // account. Clearing here is what makes the UI show "not connected" again
    // instead of failing on every subsequent call.
    await clearTokens();
    return null;
  }
}

export async function revoke(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(REFRESH_COOKIE)?.value ?? jar.get(ACCESS_COOKIE)?.value;
  if (token) {
    // Best effort — the local cookies are cleared either way, so a failure
    // here cannot leave the viewer looking connected when they are not.
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      cache: 'no-store',
    }).catch(() => {});
  }
  await clearTokens();
}

/* --------------------------- authed API calls --------------------------- */

export class NotConnectedError extends Error {
  constructor() { super('No YouTube account is connected'); }
}

/** Calls the Data API as the connected user rather than with the project key. */
export async function authedFetch<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown },
): Promise<T> {
  const token = await accessToken();
  if (!token) throw new NotConnectedError();

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }

  const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      await clearTokens();
      throw new NotConnectedError();
    }
    throw new Error(`YouTube ${endpoint} ${res.status}: ${text.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}
