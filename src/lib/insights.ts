import type { HistoryEntry } from './types';

/* ==========================================================================
   Watch insights.

   Pure functions over the history collection — no network, no Firestore, so
   the whole page is testable from a fixture and re-renders cost nothing.

   One honesty note that the UI repeats: history stores *one document per
   video* holding the furthest position reached, not a log of viewing
   sessions. So "time watched" is the sum of furthest positions. For a normal
   linear watch that is exact; for a video someone scrubbed to the end of, it
   over-counts. It is the closest true statement the schema supports, and the
   page says so rather than implying a precision it does not have.
   ========================================================================== */

export interface ChannelStat {
  channel: string;
  channelId: string;
  seconds: number;
  videos: number;
  finished: number;
}

export interface DayCell {
  /** Local ISO date, YYYY-MM-DD. */
  date: string;
  seconds: number;
  videos: number;
}

export interface Insights {
  hasData: boolean;
  totalSeconds: number;
  videosStarted: number;
  videosFinished: number;
  /** 0–1. Undefined when nothing has been started. */
  completionRate: number;
  channels: ChannelStat[];
  distinctChannels: number;
  /** Newest last, exactly `days` long, gaps filled with zeroes. */
  days: DayCell[];
  currentStreak: number;
  longestStreak: number;
  /** 24 buckets, index = local hour. */
  hours: number[];
  peakHour: number;
  lengths: { label: string; seconds: number; videos: number }[];
  busiestDay: DayCell | null;
  longest: HistoryEntry | null;
  firstWatchedAt: number | null;
}

const DAY_MS = 86_400_000;

/** Local calendar date. Using UTC here would put late-evening viewing on the
 *  wrong day for anyone west of Greenwich. */
function localDate(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 26 weeks by default: half a year reads as a real habit rather than a
 *  fortnight's noise, and it fills the width of the card it sits in. */
export function buildInsights(history: HistoryEntry[], days = 182): Insights {
  const empty: Insights = {
    hasData: false,
    totalSeconds: 0,
    videosStarted: 0,
    videosFinished: 0,
    completionRate: 0,
    channels: [],
    distinctChannels: 0,
    days: buildDayGrid(new Map(), days),
    currentStreak: 0,
    longestStreak: 0,
    hours: Array(24).fill(0),
    peakHour: 0,
    lengths: [],
    busiestDay: null,
    longest: null,
    firstWatchedAt: null,
  };

  if (history.length === 0) return empty;

  let totalSeconds = 0;
  let videosFinished = 0;
  let firstWatchedAt = Number.POSITIVE_INFINITY;
  let longest: HistoryEntry | null = null;

  const byChannel = new Map<string, ChannelStat>();
  const byDate = new Map<string, DayCell>();
  const hours = Array(24).fill(0) as number[];

  const lengthBuckets = [
    { label: 'Under 4 min', max: 240, seconds: 0, videos: 0 },
    { label: '4–20 min', max: 1200, seconds: 0, videos: 0 },
    { label: 'Over 20 min', max: Number.POSITIVE_INFINITY, seconds: 0, videos: 0 },
  ];

  for (const entry of history) {
    // A negative or absurd progress value would poison every total; clamp to
    // the video's own duration where one is known.
    const watched = Math.max(0, Math.min(entry.progress || 0, entry.durationSeconds || entry.progress || 0));
    totalSeconds += watched;
    if (entry.completed) videosFinished += 1;
    if (entry.watchedAt < firstWatchedAt) firstWatchedAt = entry.watchedAt;
    if (!longest || (entry.durationSeconds ?? 0) > (longest.durationSeconds ?? 0)) longest = entry;

    const channelKey = entry.channelId || entry.channelTitle || 'Unknown';
    const channel = byChannel.get(channelKey);
    if (channel) {
      channel.seconds += watched;
      channel.videos += 1;
      if (entry.completed) channel.finished += 1;
    } else {
      byChannel.set(channelKey, {
        channel: entry.channelTitle || 'Unknown channel',
        channelId: entry.channelId,
        seconds: watched,
        videos: 1,
        finished: entry.completed ? 1 : 0,
      });
    }

    const date = localDate(entry.watchedAt);
    const cell = byDate.get(date);
    if (cell) { cell.seconds += watched; cell.videos += 1; }
    else byDate.set(date, { date, seconds: watched, videos: 1 });

    hours[new Date(entry.watchedAt).getHours()] += watched;

    const bucket = lengthBuckets.find((b) => (entry.durationSeconds || 0) <= b.max)!;
    bucket.seconds += watched;
    bucket.videos += 1;
  }

  const grid = buildDayGrid(byDate, days);
  const { current, longest: longestStreak } = streaks(byDate);

  const busiestDay = [...byDate.values()].reduce<DayCell | null>(
    (best, cell) => (!best || cell.seconds > best.seconds ? cell : best),
    null,
  );

  const peakHour = hours.reduce((best, v, i) => (v > hours[best] ? i : best), 0);

  return {
    hasData: true,
    totalSeconds,
    videosStarted: history.length,
    videosFinished,
    completionRate: history.length > 0 ? videosFinished / history.length : 0,
    channels: [...byChannel.values()].sort((a, b) => b.seconds - a.seconds),
    distinctChannels: byChannel.size,
    days: grid,
    currentStreak: current,
    longestStreak,
    hours,
    peakHour,
    lengths: lengthBuckets.filter((b) => b.videos > 0).map(({ label, seconds, videos }) => ({ label, seconds, videos })),
    busiestDay,
    longest,
    firstWatchedAt: Number.isFinite(firstWatchedAt) ? firstWatchedAt : null,
  };
}

/** A dense run of days ending today, so the heatmap has no holes to special-case. */
function buildDayGrid(byDate: Map<string, DayCell>, days: number): DayCell[] {
  const today = startOfLocalDay(Date.now());
  const out: DayCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = localDate(today - i * DAY_MS);
    out.push(byDate.get(date) ?? { date, seconds: 0, videos: 0 });
  }
  return out;
}

/** Current streak counts back from today, but tolerates today being empty —
 *  otherwise a streak "breaks" every morning until you watch something. */
function streaks(byDate: Map<string, DayCell>): { current: number; longest: number } {
  if (byDate.size === 0) return { current: 0, longest: 0 };

  const today = startOfLocalDay(Date.now());
  const active = new Set([...byDate.keys()]);

  let current = 0;
  const startedYesterday = !active.has(localDate(today));
  for (let i = startedYesterday ? 1 : 0; ; i++) {
    if (!active.has(localDate(today - i * DAY_MS))) break;
    current += 1;
  }

  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const date of sorted) {
    const ms = new Date(`${date}T00:00:00`).getTime();
    run = previous !== null && Math.round((ms - previous) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = ms;
  }

  return { current, longest };
}

/** "12h 40m" — the phrasing the page leads with. */
export function humanDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}
