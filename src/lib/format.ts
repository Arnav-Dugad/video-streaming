/** Display formatters. Deliberately terse output — this UI is dense and every
 *  character of chrome competes with the artwork. */

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const FULL = new Intl.NumberFormat('en-US');

export function compactNumber(n?: number | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (n < 1000) return FULL.format(n);
  return COMPACT.format(n).replace('.0', '');
}

export function fullNumber(n?: number | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return FULL.format(n);
}

/** PT1H2M10S -> 3730 */
export function parseISODuration(iso?: string): number {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (+(d || 0) * 86400) + (+(h || 0) * 3600) + (+(min || 0) * 60) + +(s || 0);
}

/** 3730 -> "1:02:10". Always drops the leading zero on the hour. */
export function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds || totalSeconds < 0 || !Number.isFinite(totalSeconds)) return '0:00';
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'], [60, 'minute'], [24, 'hour'],
  [7, 'day'], [4.34524, 'week'], [12, 'month'], [Number.POSITIVE_INFINITY, 'year'],
];

export function timeAgo(input: string | number | Date): string {
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  let delta = (then - Date.now()) / 1000;
  for (const [span, unit] of DIVISIONS) {
    if (Math.abs(delta) < span) return RELATIVE.format(Math.round(delta), unit);
    delta /= span;
  }
  return '';
}

export function formatDate(input: string | number | Date): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "1.2M views" but "1 view" — the singular case is where cheap UIs give
 *  themselves away. */
export function viewLabel(n?: number): string {
  if (n === undefined || n === null) return 'No views yet';
  if (n === 1) return '1 view';
  return `${compactNumber(n)} views`;
}

export function subscriberLabel(n?: number): string {
  if (n === undefined || n === null) return '';
  if (n === 1) return '1 subscriber';
  return `${compactNumber(n)} subscribers`;
}

/** YouTube descriptions arrive as plain text with bare URLs and \n. Turn them
 *  into safe segments the renderer can map over — never dangerouslySetInnerHTML. */
export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; href: string }
  | { kind: 'timestamp'; value: string; seconds: number };

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;
const TS_RE = /\b((?:\d{1,2}:)?\d{1,2}:\d{2})\b/g;

export function parseDescription(text: string): TextSegment[] {
  if (!text) return [];
  const out: TextSegment[] = [];
  // Split on URLs first so timestamps inside URLs aren't clobbered.
  for (const chunk of text.split(URL_RE)) {
    if (!chunk) continue;
    if (/^https?:\/\//.test(chunk)) {
      out.push({ kind: 'link', value: chunk.replace(/^https?:\/\/(www\.)?/, ''), href: chunk });
      continue;
    }
    let last = 0;
    for (const m of chunk.matchAll(TS_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push({ kind: 'text', value: chunk.slice(last, idx) });
      out.push({ kind: 'timestamp', value: m[1], seconds: hmsToSeconds(m[1]) });
      last = idx + m[1].length;
    }
    if (last < chunk.length) out.push({ kind: 'text', value: chunk.slice(last) });
  }
  return out;
}

export function hmsToSeconds(hms: string): number {
  const parts = hms.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Chapters are a community convention, not an API field: a description line
 *  that begins with a timestamp and is followed by a label. */
export interface Chapter { seconds: number; label: string }

export function extractChapters(description: string, durationSeconds: number): Chapter[] {
  if (!description) return [];
  const found: Chapter[] = [];
  for (const line of description.split('\n')) {
    const m = /^\s*[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s*[-–—:|]?\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const seconds = hmsToSeconds(m[1]);
    const label = m[2].replace(/^[-–—:|\s]+/, '').trim();
    if (!label || label.length > 90) continue;
    if (durationSeconds && seconds > durationSeconds) continue;
    found.push({ seconds, label });
  }
  // A real chapter list starts at zero, is monotonic, and has at least 3 marks.
  if (found.length < 3 || found[0].seconds > 5) return [];
  for (let i = 1; i < found.length; i++) {
    if (found[i].seconds <= found[i - 1].seconds) return [];
  }
  return found;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Deterministic hue from any string — used for avatar fallbacks and room
 *  colours so a given user is always the same colour everywhere. */
export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${compactNumber(n)} ${n === 1 ? one : many}`;
}
