'use client';

/* ==========================================================================
   YouTube IFrame Player API loader.

   The API is a global singleton with a single global-callback entry point
   (`onYouTubeIframeAPIReady`), which does not compose with React's lifecycle.
   This wraps it in a promise that is created once per page load and shared by
   every caller, so mounting two players never races the script tag.
   ========================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoLoadedFraction(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  /** e.g. ['hd1080','hd720','large','medium','small','tiny','auto'] */
  getAvailableQualityLevels(): string[];
  getPlaybackQuality(): string;
  /** Deprecated by YouTube — see `applyQuality` in lib/player-quality.ts. */
  setPlaybackQuality(quality: string): void;
  /** Undocumented but still honoured more often than setPlaybackQuality. */
  setPlaybackQualityRange?(min: string, max: string): void;
  loadModule(module: string): void;
  unloadModule(module: string): void;
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  setOption(module: string, option: string, value: unknown): void;
  getOption(module: string, option: string): unknown;
  getOptions(module?: string): unknown;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

export function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return; }

    // Chain onto any existing handler rather than clobbering it.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-yt-iframe-api]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.ytIframeApi = 'true';
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Failed to load the YouTube player. Check your connection or ad blocker.'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}
