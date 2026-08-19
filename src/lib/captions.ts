'use client';

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/* ==========================================================================
   Client side of the caption proxy.

   Results are memoised per (video, track) for the life of the page: cue text
   never changes, and switching a subtitle track off and on again should not
   cost a round trip.
   ========================================================================== */

const cache = new Map<string, Cue[]>();
const inflight = new Map<string, Promise<Cue[]>>();

export interface TrackRef {
  languageCode: string;
  isAuto?: boolean;
  /** YouTube's track `name`, present on videos with several tracks per language. */
  name?: string;
}

function keyFor(videoId: string, track: TrackRef): string {
  return `${videoId}|${track.languageCode}|${track.isAuto ? 'asr' : ''}|${track.name ?? ''}`;
}

export async function fetchCues(videoId: string, track: TrackRef): Promise<Cue[]> {
  const key = keyFor(videoId, track);

  const hit = cache.get(key);
  if (hit) return hit;

  const running = inflight.get(key);
  if (running) return running;

  const params = new URLSearchParams({ v: videoId, lang: track.languageCode });
  if (track.isAuto) params.set('kind', 'asr');
  if (track.name) params.set('name', track.name);

  const request = fetch(`/api/captions?${params}`)
    .then((res) => (res.ok ? res.json() : { cues: [] }))
    .then((data: { cues?: Cue[] }) => {
      const cues = Array.isArray(data.cues) ? data.cues : [];
      // An empty answer is cached too. It means this video is one the endpoint
      // will not serve, and retrying on every toggle would just be slow.
      cache.set(key, cues);
      return cues;
    })
    .catch(() => {
      cache.set(key, []);
      return [] as Cue[];
    })
    .finally(() => { inflight.delete(key); });

  inflight.set(key, request);
  return request;
}

/**
 * The cue covering `seconds`.
 *
 * Binary search rather than a scan: this runs on every progress tick, and an
 * auto-generated track for a long video runs to several thousand cues.
 */
export function cueAt(cues: Cue[], seconds: number): Cue | null {
  let lo = 0;
  let hi = cues.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid];
    if (seconds < cue.start) hi = mid - 1;
    else if (seconds >= cue.end) lo = mid + 1;
    else return cue;
  }
  return null;
}
