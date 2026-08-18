import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

import { getVideo } from '@/lib/youtube';
import { compactNumber, formatDuration } from '@/lib/format';

/* ==========================================================================
   Open Graph card for a video.

   Lives at /api/og rather than as an `opengraph-image` file because /watch
   identifies its video through a query string, and the file convention only
   receives route params.

   Everything is drawn from data already fetched for the page, and every
   external dependency (the thumbnail, the display font) is optional — a card
   that throws would leave every share preview blank, which is worse than a
   plainer card.
   ========================================================================== */

export const runtime = 'nodejs';
export const revalidate = 86400;

const WIDTH = 1200;
const HEIGHT = 630;

const INK = '#08080A';
const CREAM = '#F4F1EA';
const MUTED = '#8B877E';
const FLARE = '#FF4A2E';

/** Optional: a missing font must degrade to the built-in sans, never throw. */
async function loadDisplayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 604800 } },
    ).then((r) => (r.ok ? r.text() : ''));

    const url = /src:\s*url\((https:\/\/[^)]+\.(?:woff2?|ttf))\)/.exec(css)?.[1];
    if (!url) return null;

    const res = await fetch(url, { next: { revalidate: 604800 } });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('v')?.trim();

  const video = id && /^[\w-]{6,20}$/.test(id)
    ? await getVideo(id).catch(() => null)
    : null;

  const font = await loadDisplayFont();

  const title = video?.title ?? 'PRISM';
  const channel = video?.channelTitle ?? 'Everything worth watching';
  const thumb = video ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null;

  // Long titles need to step down or they overflow the card.
  const titleSize = title.length > 90 ? 46 : title.length > 55 ? 56 : 68;

  const meta: { text?: string; separator?: boolean; strong?: boolean }[] = [
    { text: channel, strong: true },
  ];
  if (video?.durationSeconds) {
    meta.push({ separator: true }, { text: formatDuration(video.durationSeconds) });
  }
  if (video?.viewCount !== undefined) {
    meta.push({ separator: true }, { text: `${compactNumber(video.viewCount)} views` });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column',
          backgroundColor: INK, position: 'relative', padding: 64,
          fontFamily: font ? 'Display' : 'sans-serif',
        }}
      >
        {thumb && (
          // satori renders a static SVG, not a DOM — next/image would emit
          // markup it cannot parse. A plain <img> is the only option here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            width={WIDTH}
            height={HEIGHT}
            style={{
              position: 'absolute', inset: 0, width: WIDTH, height: HEIGHT,
              objectFit: 'cover', opacity: 0.28,
            }}
            alt=""
          />
        )}
        {/* Scrim so the copy is legible over any artwork. */}
        <div
          style={{
            position: 'absolute', inset: 0, width: WIDTH, height: HEIGHT,
            background: `linear-gradient(100deg, ${INK} 32%, rgba(8,8,10,0.72) 100%)`,
          }}
        />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
            <path d="M16 5.5 27 25.5H5L16 5.5Z" stroke={CREAM} strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M2 15h9" stroke={CREAM} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M20.5 13.5 30.5 10" stroke={FLARE} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M21.5 16h9" stroke="#FF7757" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M20.5 18.5 30.5 22" stroke="#9DB4FF" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span style={{ color: CREAM, fontSize: 22, letterSpacing: 6, fontWeight: 600 }}>PRISM</span>
        </div>

        <div
          style={{
            position: 'relative', display: 'flex', flexDirection: 'column',
            justifyContent: 'flex-end', flex: 1, paddingTop: 40,
          }}
        >
          <div
            style={{
              color: CREAM, fontSize: titleSize, lineHeight: 1.08,
              letterSpacing: -1.5, display: 'flex', maxWidth: 940,
            }}
          >
            {title.length > 130 ? `${title.slice(0, 127)}…` : title}
          </div>

          {/* Built as a flat list of spans: satori does not apply flex `gap`
              across fragment boundaries, so nesting these in <> </> collapses
              the space on one side of each separator. */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 16, marginTop: 32,
              color: MUTED, fontSize: 24,
            }}
          >
            {meta.map((part, i) =>
              part.separator
                ? <span key={i} style={{ color: '#5A574F' }}>·</span>
                : <span key={i} style={{ color: part.strong ? CREAM : MUTED }}>{part.text}</span>,
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 6,
            background: `linear-gradient(90deg, ${FLARE}, #FF7757, #9DB4FF)`,
          }}
        />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: font ? [{ name: 'Display', data: font, style: 'normal', weight: 400 }] : undefined,
    },
  );
}
