/** The deployment's own origin, no trailing slash.
 *
 * Deliberately defensive: `??` only falls back on null/undefined, and Vercel
 * (or a human) can easily leave NEXT_PUBLIC_SITE_URL set to an empty string
 * rather than unset — which `new URL('')` throws on, hard-failing the build.
 * This is used at build time (sitemap, robots, metadata), so it must never
 * throw regardless of what's in the environment. */
const FALLBACK = 'https://prism-stream.vercel.app';

function resolve(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK;
  try {
    return new URL(raw).origin;
  } catch {
    console.warn(`[site] NEXT_PUBLIC_SITE_URL is not a valid URL ("${raw}") — falling back to ${FALLBACK}`);
    return FALLBACK;
  }
}

export const SITE_URL = resolve();
