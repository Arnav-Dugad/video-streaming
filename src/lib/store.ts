'use client';

import { create } from 'zustand';
import type { Video } from './types';
import type { CaptionTrack } from './player-modules';

/* ==========================================================================
   Player store.

   The YouTube iframe is mounted exactly once, at the root of the app, and is
   never unmounted while a video is loaded. Pages that want to show it inline
   render an empty *slot* and publish its rectangle here; the host animates
   itself onto that rectangle. Navigate away and the slot disappears, so the
   host flies to the bottom-right dock — playback never stops and the iframe
   never reloads. That is the whole trick behind continuous playback.
   ========================================================================== */

export interface Rect { top: number; left: number; width: number; height: number }

export type PlayerMode = 'inline' | 'docked' | 'theatre' | 'hidden';

interface PlayerState {
  video: Video | null;
  /** Where the inline slot currently is in the viewport, or null if unmounted. */
  slot: Rect | null;
  mode: PlayerMode;
  playing: boolean;
  muted: boolean;
  volume: number;
  /** Live position, mirrored out of the iframe each frame. */
  position: number;
  duration: number;
  buffered: number;
  ready: boolean;
  /** Seconds to jump to on load — used to resume from history. */
  pendingSeek: number | null;
  /** Queue for autoplay-next and the up-next rail. */
  queue: Video[];
  ambient: boolean;
  playbackRate: number;
  /** The viewer's preferred quality id, or 'auto'. YouTube may override it —
   *  `actualQuality` is what the player reported back. */
  quality: string;
  actualQuality: string;
  availableQualities: string[];
  /** Active caption language code, or null when captions are off. */
  captionTrack: string | null;
  captionTracks: CaptionTrack[];

  load(video: Video, opts?: { startAt?: number; queue?: Video[] }): void;
  setSlot(rect: Rect | null): void;
  setMode(mode: PlayerMode): void;
  setPlaying(playing: boolean): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  setProgress(position: number, duration: number, buffered: number): void;
  setReady(ready: boolean): void;
  consumeSeek(): number | null;
  requestSeek(seconds: number): void;
  setQueue(queue: Video[]): void;
  playNext(): Video | null;
  setAmbient(on: boolean): void;
  setPlaybackRate(rate: number): void;
  setQuality(quality: string, actual?: string): void;
  setAvailableQualities(levels: string[]): void;
  setCaptionTrack(code: string | null): void;
  setCaptionTracks(tracks: CaptionTrack[]): void;
  close(): void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  video: null,
  slot: null,
  mode: 'hidden',
  playing: false,
  muted: false,
  volume: 80,
  position: 0,
  duration: 0,
  buffered: 0,
  ready: false,
  pendingSeek: null,
  queue: [],
  ambient: true,
  playbackRate: 1,
  quality: 'auto',
  actualQuality: 'auto',
  availableQualities: [],
  captionTrack: null,
  captionTracks: [],

  load: (video, opts) =>
    set((s) => ({
      video,
      queue: opts?.queue ?? s.queue,
      pendingSeek: opts?.startAt && opts.startAt > 5 ? opts.startAt : null,
      position: opts?.startAt ?? 0,
      duration: video.durationSeconds ?? 0,
      buffered: 0,
      ready: false,
      playing: true,
      mode: s.slot ? 'inline' : 'docked',
      // Renditions and caption tracks are per-video; carrying them over would
      // leave the settings menu describing the previous one.
      availableQualities: [],
      actualQuality: 'auto',
      captionTracks: [],
      captionTrack: null,
    })),

  setSlot: (slot) =>
    set((s) => {
      if (!s.video) return { slot };
      if (s.mode === 'theatre') return { slot };
      return { slot, mode: slot ? 'inline' : 'docked' };
    }),

  setMode: (mode) => set({ mode }),
  setPlaying: (playing) => set({ playing }),
  setMuted: (muted) => set({ muted }),
  setVolume: (volume) => set({ volume: Math.min(100, Math.max(0, volume)), muted: volume === 0 }),
  setProgress: (position, duration, buffered) => set({ position, duration, buffered }),
  setReady: (ready) => set({ ready }),

  consumeSeek: () => {
    const { pendingSeek } = get();
    if (pendingSeek !== null) set({ pendingSeek: null });
    return pendingSeek;
  },
  requestSeek: (seconds) => set({ pendingSeek: Math.max(0, seconds), position: Math.max(0, seconds) }),

  setQueue: (queue) => set({ queue }),

  playNext: () => {
    const { queue } = get();
    const [next, ...rest] = queue;
    if (!next) return null;
    set({
      video: next,
      queue: rest,
      position: 0,
      duration: next.durationSeconds ?? 0,
      buffered: 0,
      ready: false,
      playing: true,
      pendingSeek: null,
      availableQualities: [],
      actualQuality: 'auto',
      captionTracks: [],
      captionTrack: null,
    });
    return next;
  },

  setAmbient: (ambient) => set({ ambient }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setQuality: (quality, actual) => set({ quality, actualQuality: actual ?? quality }),
  setAvailableQualities: (availableQualities) => set({ availableQualities }),
  setCaptionTrack: (captionTrack) => set({ captionTrack }),
  setCaptionTracks: (captionTracks) => set({ captionTracks }),

  close: () =>
    set({
      video: null, mode: 'hidden', playing: false, position: 0,
      duration: 0, buffered: 0, ready: false, queue: [], pendingSeek: null,
    }),
}));

/* ------------------------------ UI store -------------------------------- */

interface UIState {
  paletteOpen: boolean;
  navOpen: boolean;
  shortcutsOpen: boolean;
  /** Recent queries, newest first. Persisted to localStorage. */
  recentSearches: string[];
  openPalette(): void;
  closePalette(): void;
  togglePalette(): void;
  setNavOpen(open: boolean): void;
  toggleShortcuts(): void;
  pushSearch(q: string): void;
  clearSearches(): void;
  hydrateSearches(): void;
}

const RECENT_KEY = 'prism:recent-searches';

export const useUI = create<UIState>((set, get) => ({
  paletteOpen: false,
  navOpen: false,
  shortcutsOpen: false,
  recentSearches: [],

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setNavOpen: (navOpen) => set({ navOpen }),
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),

  pushSearch: (q) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const next = [trimmed, ...get().recentSearches.filter((s) => s !== trimmed)].slice(0, 8);
    set({ recentSearches: next });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  },

  clearSearches: () => {
    set({ recentSearches: [] });
    try { localStorage.removeItem(RECENT_KEY); } catch { /* private mode */ }
  },

  hydrateSearches: () => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) set({ recentSearches: JSON.parse(raw) as string[] });
    } catch { /* private mode */ }
  },
}));

/* ------------------------------- toasts --------------------------------- */

export interface Toast {
  id: number;
  message: string;
  tone: 'neutral' | 'success' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push(message: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }): void;
  dismiss(id: number): void;
}

let toastSeq = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, opts) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone: opts?.tone ?? 'neutral', action: opts?.action }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }) {
  useToasts.getState().push(message, opts);
}
