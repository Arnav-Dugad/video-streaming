import { NextResponse, type NextRequest } from 'next/server';

/* ==========================================================================
   Subtitle cues, proxied.

   Why this exists at all: YouTube draws its own captions inside the embed,
   and the embed is cross-origin — no stylesheet of ours can reach them. They
   sit near the bottom of the frame, which is exactly where our control bar
   is, so every time the controls come up the dialogue goes behind them.

   Fetching the cue text ourselves and drawing it in the page is the only way
   to control where it sits. The timedtext endpoint is not CORS-readable from
   a browser, hence the server hop.

   This is best-effort by design. YouTube does not guarantee this endpoint,
   and it returns nothing for plenty of videos. The caller treats an empty
   result as "leave YouTube's own captions switched on" rather than as an
   error, so the worst case is the behaviour we already had.
   ========================================================================== */

export interface Cue {
  /** Seconds. */
  start: number;
  end: number;
  text: string;
}

const TIMEDTEXT = 'https://www.youtube.com/api/timedtext';
const UPSTREAM_TIMEOUT_MS = 6000;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Without a browser-shaped Accept-Language the endpoint sometimes
        // answers with an empty document rather than the track.
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (compatible; PRISM/1.0)',
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** json3: { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] } */
function parseJson3(body: string): Cue[] {
  let data: unknown;
  try { data = JSON.parse(body); } catch { return []; }

  const events = (data as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return [];

  const cues: Cue[] = [];
  for (const raw of events) {
    const e = raw as { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] };
    if (typeof e.tStartMs !== 'number' || !Array.isArray(e.segs)) continue;
    const text = e.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const start = e.tStartMs / 1000;
    // Cues with no duration are position markers in auto-generated tracks.
    const end = start + (e.dDurationMs ?? 0) / 1000;
    if (end <= start) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ',
};

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });
}

/** Legacy: <transcript><text start="1.2" dur="3.4">Hello</text></transcript> */
function parseXml(body: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<text\s+([^>]*)>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(body)) !== null) {
    const attrs = m[1];
    const start = Number(/start="([^"]+)"/.exec(attrs)?.[1]);
    const dur = Number(/dur="([^"]+)"/.exec(attrs)?.[1] ?? '0');
    if (!Number.isFinite(start)) continue;

    // Entities are escaped twice in this format: once for the XML, once by
    // whatever produced the caption text.
    const text = decode(decode(m[2].replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    cues.push({ start, end: start + (Number.isFinite(dur) ? dur : 3), text });
  }
  return cues;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const v = (params.get('v') ?? '').trim();
  const lang = (params.get('lang') ?? '').trim();
  const kind = params.get('kind') === 'asr' ? 'asr' : '';
  const name = params.get('name') ?? '';

  // Video ids are 11 characters of an unreserved alphabet; anything else is
  // not a request this route can serve, and must not be pasted into a URL.
  if (!/^[\w-]{11}$/.test(v) || !/^[A-Za-z-]{2,12}$/.test(lang)) {
    return NextResponse.json({ cues: [] }, { status: 400 });
  }

  const base = new URL(TIMEDTEXT);
  base.searchParams.set('v', v);
  base.searchParams.set('lang', lang);
  if (kind) base.searchParams.set('kind', kind);
  if (name) base.searchParams.set('name', name.slice(0, 120));

  // json3 is the format the modern player uses; the XML one is what older
  // tracks still answer with. Whichever produces cues wins.
  const json3 = new URL(base.toString());
  json3.searchParams.set('fmt', 'json3');

  let cues = parseJson3(await fetchText(json3.toString()));
  if (cues.length === 0) cues = parseXml(await fetchText(base.toString()));

  cues.sort((a, b) => a.start - b.start);

  return NextResponse.json(
    { cues },
    {
      headers: {
        // Cue text for a given video never changes, so this is worth holding
        // on to — and an empty result is worth holding on to for less long,
        // in case the upstream was merely having a bad minute.
        'Cache-Control': cues.length > 0
          ? 'public, s-maxage=86400, stale-while-revalidate=604800'
          : 'public, s-maxage=300',
      },
    },
  );
}
