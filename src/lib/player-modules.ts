'use client';

import type { YTPlayer } from '@/hooks/useYouTubeApi';

/* ==========================================================================
   Quality and caption control for the IFrame player.

   Both of these are messier than the API docs suggest, and both are wrapped
   here so the UI can be honest about what actually happened rather than
   showing a checkmark next to a setting that silently did nothing.
   ========================================================================== */

/* ------------------------------- quality -------------------------------- */

/** YouTube's internal quality ids, best first. */
export const QUALITY_ORDER = [
  'highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080',
  'hd720', 'large', 'medium', 'small', 'tiny',
] as const;

const QUALITY_LABELS: Record<string, string> = {
  auto: 'Auto',
  highres: 'Highest',
  hd2880: '2880p',
  hd2160: '2160p',
  hd1440: '1440p',
  hd1080: '1080p',
  hd720: '720p',
  large: '480p',
  medium: '360p',
  small: '240p',
  tiny: '144p',
};

export function qualityLabel(id: string): string {
  return QUALITY_LABELS[id] ?? id;
}

/** Sorts the player's reported levels best-first and drops 'auto' (the UI
 *  always renders Auto itself, at the top, whether or not it is listed). */
export function sortQualities(levels: string[]): string[] {
  const rank = new Map(QUALITY_ORDER.map((q, i) => [q as string, i]));
  return levels
    .filter((q) => q !== 'auto' && q !== 'unknown')
    .sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
}

export type QualityOutcome = 'applied' | 'overridden' | 'unsupported';

/**
 * Ask the player for a quality and report what it actually did.
 *
 * YouTube deprecated `setPlaybackQuality` — the reference says outright that
 * it "will have no effect", because adaptive streaming picks the rendition
 * from bandwidth and viewport instead. The undocumented
 * `setPlaybackQualityRange` is honoured more often, particularly when capping
 * quality *down*, so it is tried first.
 *
 * Neither is guaranteed, so this reads the quality back afterwards and returns
 * what really happened. The caller surfaces that, rather than assuming.
 */
export async function applyQuality(
  player: YTPlayer,
  quality: string,
): Promise<{ outcome: QualityOutcome; actual: string }> {
  try {
    if (quality === 'auto') {
      // There is no "clear override" call; widening the range to everything
      // is the closest thing to handing control back to adaptive streaming.
      player.setPlaybackQualityRange?.('tiny', 'highres');
      player.setPlaybackQuality('default');
    } else {
      player.setPlaybackQualityRange?.(quality, quality);
      player.setPlaybackQuality(quality);
    }
  } catch {
    return { outcome: 'unsupported', actual: safeQuality(player) };
  }

  // The switch happens on the next segment boundary, not immediately.
  await new Promise((resolve) => setTimeout(resolve, 1400));

  const actual = safeQuality(player);
  if (quality === 'auto') return { outcome: 'applied', actual };
  return { outcome: actual === quality ? 'applied' : 'overridden', actual };
}

function safeQuality(player: YTPlayer): string {
  try {
    return player.getPlaybackQuality() || 'auto';
  } catch {
    return 'auto';
  }
}

export function availableQualities(player: YTPlayer): string[] {
  try {
    return sortQualities(player.getAvailableQualityLevels() ?? []);
  } catch {
    return [];
  }
}

/* ------------------------------- captions ------------------------------- */

export interface CaptionTrack {
  languageCode: string;
  languageName: string;
  /** Auto-generated tracks are marked so the UI can label them. */
  isAuto: boolean;
}

/* The module is called 'captions' on the HTML5 player and 'cc' on the old AS3
   one. Which responds varies by embed, so every call tries both. */
const MODULES = ['captions', 'cc'] as const;

/** Captions are lazily loaded — nothing works until the module is in. */
export function loadCaptionModule(player: YTPlayer): void {
  for (const m of MODULES) {
    try { player.loadModule(m); } catch { /* module unavailable on this embed */ }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function getCaptionTracks(player: YTPlayer): CaptionTrack[] {
  for (const m of MODULES) {
    try {
      const raw = player.getOption(m, 'tracklist') as any[];
      if (Array.isArray(raw) && raw.length > 0) {
        return raw
          .map((t) => ({
            languageCode: String(t.languageCode ?? t.lc ?? ''),
            languageName: String(t.displayName ?? t.languageName ?? t.name ?? t.languageCode ?? ''),
            // `vss_id` starting with 'a.' is YouTube's marker for ASR tracks.
            isAuto: String(t.vss_id ?? t.id ?? '').startsWith('a.') || t.kind === 'asr',
          }))
          .filter((t) => t.languageCode);
      }
    } catch { /* try the next module name */ }
  }
  return [];
}

/** Pass null to turn captions off. */
export function setCaptionTrack(player: YTPlayer, languageCode: string | null): boolean {
  let ok = false;
  for (const m of MODULES) {
    try {
      player.setOption(m, 'track', languageCode ? { languageCode } : {});
      ok = true;
    } catch { /* try the next module name */ }
  }
  return ok;
}

export function activeCaptionTrack(player: YTPlayer): string | null {
  for (const m of MODULES) {
    try {
      const track = player.getOption(m, 'track') as any;
      const code = track?.languageCode;
      if (code) return String(code);
    } catch { /* try the next module name */ }
  }
  return null;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Prefers the viewer's own language, then English, then whatever is first. */
export function preferredTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const nav = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
  return (
    tracks.find((t) => t.languageCode.split('-')[0] === nav && !t.isAuto) ??
    tracks.find((t) => t.languageCode.split('-')[0] === nav) ??
    tracks.find((t) => t.languageCode.startsWith('en') && !t.isAuto) ??
    tracks.find((t) => t.languageCode.startsWith('en')) ??
    tracks[0]
  );
}
