'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Captions, Check, ChevronLeft, ChevronRight, Maximize, Minimize, Minimize2,
  Pause, Play, RotateCcw, RotateCw, Settings, SkipForward, Sparkles, Tv2,
  Volume1, Volume2, VolumeX,
} from 'lucide-react';

import { usePlayer } from '@/lib/store';
import { formatDuration, extractChapters, type Chapter } from '@/lib/format';
import { useKeyboard } from '@/hooks/useKeyboard';
import { usePreferences } from '@/hooks/usePreferences';
import { cn } from '@/lib/cn';
import type { YTPlayer } from '@/hooks/useYouTubeApi';
import { toast } from '@/lib/store';
import {
  activeCaptionTrack, applyQuality, availableQualities, getCaptionTracks,
  loadCaptionModule, preferredTrack, qualityLabel, setCaptionTrack as applyCaptionTrack,
} from '@/lib/player-modules';
import { fetchCues } from '@/lib/captions';

/* ==========================================================================
   Control bar.

   Everything YouTube's default chrome gives up when you set controls=0, put
   back with the behaviour people actually expect:

     · a scrubber that segments itself when the description contains chapters
     · scrub-preview showing the timecode and the chapter you are hovering
     · auto-hide after 2.6s of stillness, but never while paused or hovered
     · the full keyboard vocabulary — space/k, j/l, arrows, m, f, t, c, 0–9,
       < and > for speed
   ========================================================================== */

const HIDE_DELAY = 2600;
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface Props {
  api(): YTPlayer | null;
  compact?: boolean;
  onExitTheatre?(): void;
}

export function PlayerControls({ api, compact, onExitTheatre }: Props) {
  const router = useRouter();
  const prefs = usePreferences();
  const skip = prefs.skipInterval;
  const video = usePlayer((s) => s.video);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const buffered = usePlayer((s) => s.buffered);
  const muted = usePlayer((s) => s.muted);
  const volume = usePlayer((s) => s.volume);
  const mode = usePlayer((s) => s.mode);
  const ambient = usePlayer((s) => s.ambient);
  const queue = usePlayer((s) => s.queue);
  const rate = usePlayer((s) => s.playbackRate);
  const ready = usePlayer((s) => s.ready);
  const quality = usePlayer((s) => s.quality);
  const actualQuality = usePlayer((s) => s.actualQuality);
  const qualities = usePlayer((s) => s.availableQualities);
  const captionTrack = usePlayer((s) => s.captionTrack);
  const captionTracks = usePlayer((s) => s.captionTracks);

  const setPlaying = usePlayer((s) => s.setPlaying);
  const setMuted = usePlayer((s) => s.setMuted);
  const setVolume = usePlayer((s) => s.setVolume);
  const setMode = usePlayer((s) => s.setMode);
  const setAmbient = usePlayer((s) => s.setAmbient);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const setQuality = usePlayer((s) => s.setQuality);
  const setAvailableQualities = usePlayer((s) => s.setAvailableQualities);
  const setCaptionTrackState = usePlayer((s) => s.setCaptionTrack);
  const setCaptionTracks = usePlayer((s) => s.setCaptionTracks);
  const requestSeek = usePlayer((s) => s.requestSeek);
  const setControlsVisible = usePlayer((s) => s.setControlsVisible);
  const setCues = usePlayer((s) => s.setCues);

  const rootRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [applyingQuality, setApplyingQuality] = useState(false);

  /** null = closed. Otherwise the settings pane currently showing. */
  const [panel, setPanel] = useState<null | 'root' | 'quality' | 'speed' | 'captions'>(null);
  const menuOpen = panel !== null;

  /* Visibility is derived, not stored. `activity` ticks on every interaction;
     the idle timer records the tick it fired at. They differ exactly when
     something has happened since the controls went to sleep. Storing a
     `visible` boolean instead is what produces controls that never hide (the
     progress tick re-arms the timer 4× a second) or that vanish mid-scrub. */
  const [activity, setActivity] = useState(0);
  const [idleAt, setIdleAt] = useState(-1);

  const chapters: Chapter[] = video ? extractChapters(video.description, duration) : [];
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  /* --------------------------- auto-hide -------------------------------- */

  const wake = useCallback(() => setActivity((a) => a + 1), []);
  const sleep = useCallback(() => setIdleAt(activity), [activity]);

  // Controls stay up while paused, while scrubbing, and while a menu is open.
  const visible = !playing || scrubbing || menuOpen || idleAt !== activity;

  useEffect(() => {
    if (!playing || scrubbing || menuOpen) return;
    const t = setTimeout(() => setIdleAt(activity), HIDE_DELAY);
    return () => clearTimeout(t);
  }, [playing, scrubbing, menuOpen, activity]);

  // The caption layer needs to know, so it can sit above the bar rather than
  // behind it. Only the full bar reports — the dock's compact strip does not
  // cover the caption line.
  useEffect(() => {
    if (compact) return;
    setControlsVisible(visible);
  }, [compact, visible, setControlsVisible]);

  /* ---------------------------- transport ------------------------------- */

  const toggle = useCallback(() => {
    const p = api();
    if (!p) return;
    // Waking here is what keeps the bar up for a beat after an unpause.
    wake();
    if (playing) { p.pauseVideo(); setPlaying(false); }
    else { p.playVideo(); setPlaying(true); }
  }, [api, playing, setPlaying, wake]);

  const seekTo = useCallback((seconds: number) => {
    const p = api();
    const target = Math.max(0, Math.min(duration || Infinity, seconds));
    p?.seekTo(target, true);
    requestSeek(target);
  }, [api, duration, requestSeek]);

  const nudge = useCallback((delta: number) => seekTo(position + delta), [position, seekTo]);

  const changeVolume = useCallback((v: number) => {
    const p = api();
    setVolume(v);
    p?.setVolume(v);
    if (v === 0) p?.mute(); else p?.unMute();
  }, [api, setVolume]);

  const toggleMute = useCallback(() => {
    const p = api();
    if (muted || volume === 0) {
      p?.unMute();
      p?.setVolume(volume || 60);
      setVolume(volume || 60);
      setMuted(false);
    } else {
      p?.mute();
      setMuted(true);
    }
  }, [api, muted, volume, setMuted, setVolume]);

  const changeRate = useCallback((r: number) => {
    api()?.setPlaybackRate(r);
    setPlaybackRate(r);
    setPanel(null);
  }, [api, setPlaybackRate]);

  const stepRate = useCallback((dir: 1 | -1) => {
    const i = SPEEDS.indexOf(rate);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + dir))];
    changeRate(next);
  }, [rate, changeRate]);

  /* ------------------------ captions & quality -------------------------- */

  /** The player only knows its renditions and caption tracks once playback has
   *  actually begun, so these are read on ready and refreshed whenever the
   *  menu opens — which is the moment the answer needs to be current. */
  const refreshModules = useCallback(() => {
    const p = api();
    if (!p) return;
    setAvailableQualities(availableQualities(p));
    const tracks = getCaptionTracks(p);
    setCaptionTracks(tracks);
    setCaptionTrackState(activeCaptionTrack(p));
  }, [api, setAvailableQualities, setCaptionTracks, setCaptionTrackState]);

  const appliedQualityFor = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const p = api();
    if (!p) return;
    loadCaptionModule(p);

    // Renditions are not published the instant onReady fires.
    const t = setTimeout(() => {
      refreshModules();
      // Re-assert the viewer's saved quality on each new video — the player
      // resets to adaptive on every load, so a preference set once would
      // otherwise apply to exactly one video.
      const preferred = usePlayer.getState().quality;
      if (preferred !== 'auto' && video && appliedQualityFor.current !== video.id) {
        appliedQualityFor.current = video.id;
        applyQuality(p, preferred).then(({ actual }) => setQuality(preferred, actual));
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [ready, video, api, refreshModules, setQuality]);

  /* Choosing a track does two things at once.
   *
   *  YouTube is told about it, because that is the fallback: if we cannot get
   *  hold of the cue text, its own captions stay on and behave as they always
   *  did. In parallel we try to fetch the cues ourselves — and when that
   *  works, YouTube's layer is switched back off and <CaptionOverlay> draws
   *  them in the page, where we can keep them clear of the control bar. */
  const chooseCaptionTrack = useCallback((code: string | null) => {
    const p = api();
    if (!p) return;
    if (!applyCaptionTrack(p, code)) {
      toast('Captions are not available for this video');
      return;
    }
    setCaptionTrackState(code);
    setPanel(null);

    setCues([]);
    if (!code || !video) return;

    const meta = captionTracks.find((t) => t.languageCode === code);
    const forVideo = video.id;

    fetchCues(forVideo, { languageCode: code, isAuto: meta?.isAuto }).then((cues) => {
      const s = usePlayer.getState();
      // The viewer may have switched video or track while this was in flight.
      if (cues.length === 0 || s.video?.id !== forVideo || s.captionTrack !== code) return;
      const live = api();
      if (live) applyCaptionTrack(live, null);
      s.setCues(cues);
    });
  }, [api, captionTracks, setCaptionTrackState, setCues, video]);

  /** The `C` shortcut and the CC button: flip between off and the best track. */
  const toggleCaptions = useCallback(() => {
    const p = api();
    if (!p) return;
    if (captionTrack) { chooseCaptionTrack(null); return; }

    const tracks = captionTracks.length > 0 ? captionTracks : getCaptionTracks(p);
    if (tracks.length === 0) {
      toast('This video has no captions');
      return;
    }
    if (tracks !== captionTracks) setCaptionTracks(tracks);
    const best = preferredTrack(tracks);
    if (best) chooseCaptionTrack(best.languageCode);
  }, [api, captionTrack, captionTracks, chooseCaptionTrack, setCaptionTracks]);

  const chooseQuality = useCallback(async (q: string) => {
    const p = api();
    if (!p) return;
    setApplyingQuality(true);
    setQuality(q, q);
    setPanel(null);
    const { outcome, actual } = await applyQuality(p, q);
    setApplyingQuality(false);
    setQuality(q, actual);
    if (outcome === 'overridden') {
      // Saying nothing here would leave a checkmark next to a setting that did
      // not take, which is worse than the limitation itself.
      toast(
        `YouTube kept this at ${qualityLabel(actual)} — its adaptive streaming overrides fixed quality when bandwidth or window size demand it.`,
      );
    } else if (outcome === 'unsupported') {
      toast('This player build does not expose quality selection');
    }
  }, [api, setQuality]);

  const surface = useCallback(() => rootRef.current?.parentElement ?? null, []);

  const toggleFullscreen = useCallback(async () => {
    const el = surface();
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      toast('Fullscreen was blocked by the browser');
    }
  }, [surface]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* The browser Picture-in-Picture API cannot take this player: the embed is
     cross-origin, so its <video> element is unreachable, and moving the iframe
     into a Document PiP window destroys and reloads its browsing context.
     Docking is the equivalent that genuinely works — the same iframe keeps
     playing, uninterrupted, in a corner. */
  const dock = useCallback(() => {
    // Flagged as deliberate, so the next slot measurement (any scroll on the
    // watch page) does not immediately pull the player back out of the dock.
    setMode(mode === 'docked' ? 'inline' : 'docked', 'user');
  }, [mode, setMode]);

  const skipNext = useCallback(() => {
    const next = usePlayer.getState().playNext();
    if (next) router.push(`/watch?v=${next.id}`);
  }, [router]);

  /* ---------------------------- shortcuts ------------------------------- */

  useKeyboard(
    [
      { key: ' ', run: toggle },
      { key: 'k', run: toggle },
      { key: 'j', run: () => nudge(-skip) },
      { key: 'l', run: () => nudge(skip) },
      { key: 'arrowleft', run: () => nudge(-5) },
      { key: 'arrowright', run: () => nudge(5) },
      { key: 'arrowup', run: () => changeVolume(Math.min(100, volume + 5)) },
      { key: 'arrowdown', run: () => changeVolume(Math.max(0, volume - 5)) },
      { key: 'm', run: toggleMute },
      { key: 'f', run: toggleFullscreen },
      { key: 't', run: () => setMode(mode === 'theatre' ? 'inline' : 'theatre') },
      { key: 'c', run: toggleCaptions },
      { key: 'i', run: dock },
      { key: 'n', shift: true, run: skipNext },
      { key: ',', shift: true, run: () => stepRate(-1) },
      { key: '.', shift: true, run: () => stepRate(1) },
      { key: 'home', run: () => seekTo(0) },
      { key: 'end', run: () => seekTo(duration) },
      ...Array.from({ length: 10 }, (_, n) => ({
        key: String(n),
        run: () => duration > 0 && seekTo((duration * n) / 10),
      })),
    ],
    !compact && Boolean(video),
  );

  if (!video) return null;

  /* ----------------------------- compact -------------------------------- */

  if (compact) {
    return (
      <div ref={rootRef} className="px-2 pb-2">
        <Scrubber
          pct={pct}
          buffered={buffered * 100}
          duration={duration}
          chapters={[]}
          onSeek={seekTo}
          onScrubStart={() => setScrubbing(true)}
          onScrubEnd={() => setScrubbing(false)}
          onHover={setHoverPct}
          hoverPct={hoverPct}
          compact
        />
        <div className="mt-1.5 flex items-center gap-1">
          <Ctl label={playing ? 'Pause' : 'Play'} onClick={toggle} small>
            {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </Ctl>
          <Ctl label={`Back ${skip} seconds`} onClick={() => nudge(-skip)} small>
            <RotateCcw className="h-3.5 w-3.5" />
          </Ctl>
          <Ctl label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} small>
            {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </Ctl>
          <span className="ml-auto pr-1 font-mono text-[10px] text-cream-dim tnum">
            {formatDuration(position)} / {formatDuration(duration)}
          </span>
        </div>
      </div>
    );
  }

  /* ------------------------------ full ---------------------------------- */

  return (
    <div
      ref={rootRef}
      onMouseMove={wake}
      onMouseLeave={() => { if (playing && !scrubbing) sleep(); }}
      className={cn(
        'absolute inset-0 z-10 flex flex-col justify-end',
        !visible && !scrubbing && 'cursor-none',
      )}
    >
      {/* Click-to-pause surface. Double click toggles fullscreen. */}
      <button
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        className="absolute inset-0 bottom-16 cursor-default"
        tabIndex={-1}
      />

      {/* Paused state.

          The scrim is not decoration. With controls=0 YouTube still paints its
          own overlay when paused — the "More videos" grid, a share button, a
          watch-later button — inside the iframe, where nothing outside it can
          turn them off. There is no player parameter that suppresses them.
          Covering the frame is the only way to keep the paused state looking
          like this player rather than a YouTube embed wearing a costume. */}
      <AnimatePresence>
        {!playing && (
          <motion.div
            key="paused-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 bg-ink-950/70"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!playing && (
          <motion.div
            key="paused"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.35 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-950/60 backdrop-blur-md ring-1 ring-cream/15">
              <Play className="ml-0.5 h-6 w-6 fill-cream text-cream" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={{ opacity: visible || scrubbing ? 1 : 0, y: visible || scrubbing ? 0 : 12 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative bg-gradient-to-t from-ink-950 via-ink-950/88 to-transparent px-3 pb-3 pt-16 sm:px-4 sm:pb-4"
      >
        <Scrubber
          pct={pct}
          buffered={buffered * 100}
          duration={duration}
          chapters={chapters}
          onSeek={seekTo}
          onScrubStart={() => setScrubbing(true)}
          onScrubEnd={() => setScrubbing(false)}
          onHover={setHoverPct}
          hoverPct={hoverPct}
        />

        <div className="mt-2.5 flex items-center gap-0.5 sm:gap-1">
          <Ctl label={playing ? 'Pause (k)' : 'Play (k)'} onClick={toggle}>
            {playing ? <Pause className="h-[18px] w-[18px] fill-current" /> : <Play className="h-[18px] w-[18px] fill-current" />}
          </Ctl>
          <Ctl label={`Back ${skip} seconds (j)`} onClick={() => nudge(-skip)} className="hidden sm:grid">
            <RotateCcw className="h-4 w-4" />
          </Ctl>
          <Ctl label={`Forward ${skip} seconds (l)`} onClick={() => nudge(skip)} className="hidden sm:grid">
            <RotateCw className="h-4 w-4" />
          </Ctl>
          {queue.length > 0 && (
            <Ctl label="Play next (shift+n)" onClick={skipNext}>
              <SkipForward className="h-4 w-4" />
            </Ctl>
          )}

          <VolumeControl muted={muted} volume={volume} onToggle={toggleMute} onChange={changeVolume} />

          <span className="ml-1.5 select-none font-mono text-[11.5px] text-cream-dim tnum sm:text-xs">
            {formatDuration(position)}
            <span className="mx-1 text-faint">/</span>
            <span className="text-faint">{formatDuration(duration)}</span>
          </span>

          {chapters.length > 0 && (
            <span className="ml-3 hidden max-w-[16rem] truncate text-[11.5px] text-muted lg:inline">
              {currentChapter(chapters, position)?.label}
            </span>
          )}

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <div className="relative">
              <Ctl
                label="Settings"
                onClick={() => { setPanel((cur) => (cur === null ? 'root' : null)); refreshModules(); }}
                active={menuOpen || quality !== 'auto' || rate !== 1}
              >
                <Settings className={cn('h-4 w-4 transition-transform duration-500', menuOpen && 'rotate-45')} />
              </Ctl>

              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPanel(null)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute bottom-11 right-0 z-20 w-60 overflow-hidden rounded-xl border border-line-strong chrome shadow-float"
                      role="menu"
                    >
                      {panel === 'root' && (
                        <div className="p-1">
                          <MenuRow
                            label="Quality"
                            value={quality === 'auto'
                              ? `Auto${actualQuality !== 'auto' ? ` (${qualityLabel(actualQuality)})` : ''}`
                              : qualityLabel(quality)}
                            onClick={() => setPanel('quality')}
                          />
                          <MenuRow
                            label="Speed"
                            value={rate === 1 ? 'Normal' : `${rate}\u00d7`}
                            onClick={() => setPanel('speed')}
                          />
                          <MenuRow
                            label="Subtitles"
                            value={captionTrack
                              ? (captionTracks.find((t) => t.languageCode === captionTrack)?.languageName ?? captionTrack)
                              : 'Off'}
                            onClick={() => setPanel('captions')}
                          />
                        </div>
                      )}

                      {panel === 'quality' && (
                        <SubPanel title="Quality" onBack={() => setPanel('root')}>
                          <MenuOption
                            label="Auto"
                            hint={actualQuality !== 'auto' ? qualityLabel(actualQuality) : undefined}
                            selected={quality === 'auto'}
                            onClick={() => chooseQuality('auto')}
                          />
                          {qualities.map((q) => (
                            <MenuOption
                              key={q}
                              label={qualityLabel(q)}
                              selected={quality === q}
                              onClick={() => chooseQuality(q)}
                            />
                          ))}
                          {qualities.length === 0 && (
                            <p className="px-3 py-3 text-[11.5px] leading-relaxed text-faint">
                              {applyingQuality ? 'Switching\u2026' : 'Renditions appear once playback has started.'}
                            </p>
                          )}
                          <p className="border-t border-line px-3 py-2 text-[10.5px] leading-relaxed text-faint">
                            YouTube&apos;s adaptive streaming can override a fixed
                            choice when bandwidth or window size demand it.
                          </p>
                        </SubPanel>
                      )}

                      {panel === 'speed' && (
                        <SubPanel title="Speed" onBack={() => setPanel('root')}>
                          {SPEEDS.map((sp) => (
                            <MenuOption
                              key={sp}
                              label={sp === 1 ? 'Normal' : `${sp}\u00d7`}
                              selected={sp === rate}
                              onClick={() => changeRate(sp)}
                            />
                          ))}
                        </SubPanel>
                      )}

                      {panel === 'captions' && (
                        <SubPanel title="Subtitles" onBack={() => setPanel('root')}>
                          <MenuOption label="Off" selected={!captionTrack} onClick={() => chooseCaptionTrack(null)} />
                          {captionTracks.map((t) => (
                            <MenuOption
                              key={`${t.languageCode}-${t.isAuto}`}
                              label={t.languageName}
                              hint={t.isAuto ? 'auto-generated' : undefined}
                              selected={captionTrack === t.languageCode}
                              onClick={() => chooseCaptionTrack(t.languageCode)}
                            />
                          ))}
                          {captionTracks.length === 0 && (
                            <p className="px-3 py-3 text-[11.5px] leading-relaxed text-faint">
                              No subtitle tracks published for this video.
                            </p>
                          )}
                        </SubPanel>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <Ctl
              label={captionTrack ? 'Turn subtitles off (c)' : 'Subtitles (c)'}
              onClick={toggleCaptions}
              active={Boolean(captionTrack)}
              className="hidden sm:grid"
            >
              <Captions className="h-4 w-4" />
            </Ctl>
            <Ctl label="Ambient glow" onClick={() => setAmbient(!ambient)} active={ambient} className="hidden md:grid">
              <Sparkles className="h-4 w-4" />
            </Ctl>
            <Ctl label="Mini player (i)" onClick={dock} active={mode === 'docked'} className="hidden md:grid">
              <Minimize2 className="h-4 w-4" />
            </Ctl>
            <Ctl
              label="Theatre mode (t)"
              onClick={() => (onExitTheatre ? onExitTheatre() : setMode('theatre'))}
              active={mode === 'theatre'}
              className="hidden sm:grid"
            >
              <Tv2 className="h-4 w-4" />
            </Ctl>
            <Ctl label={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
            </Ctl>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */

function currentChapter(chapters: Chapter[], position: number): Chapter | undefined {
  let found: Chapter | undefined;
  for (const c of chapters) {
    if (c.seconds <= position) found = c;
    else break;
  }
  return found;
}

interface ScrubberProps {
  pct: number;
  buffered: number;
  duration: number;
  chapters: Chapter[];
  onSeek(seconds: number): void;
  onScrubStart(): void;
  onScrubEnd(): void;
  onHover(pct: number | null): void;
  hoverPct: number | null;
  compact?: boolean;
}

function Scrubber({
  pct, buffered, duration, chapters, onSeek, onScrubStart, onScrubEnd, onHover, hoverPct, compact,
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const pctFromEvent = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  };

  const commit = (clientX: number) => onSeek((pctFromEvent(clientX) / 100) * duration);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => onHover(pctFromEvent(e.clientX));
    const onUp = (e: PointerEvent) => {
      commit(e.clientX);
      setDragging(false);
      onScrubEnd();
      onHover(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }); // Intentionally unmemoised: handlers close over live scrub state.

  // Chapters split the track into segments with a 2px gap, like a filmstrip.
  const segments = chapters.length > 0 && duration > 0
    ? chapters.map((c, i) => {
        const start = (c.seconds / duration) * 100;
        const end = i + 1 < chapters.length ? (chapters[i + 1].seconds / duration) * 100 : 100;
        return { start, width: Math.max(0, end - start), label: c.label, seconds: c.seconds };
      })
    : [{ start: 0, width: 100, label: '', seconds: 0 }];

  const previewPct = hoverPct ?? null;
  const hoveredChapter = previewPct !== null && chapters.length > 0
    ? currentChapter(chapters, (previewPct / 100) * duration)
    : undefined;

  return (
    <div
      className={cn('group/scrub relative w-full touch-none select-none', compact ? 'py-1' : 'py-2')}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setDragging(true);
        onScrubStart();
        onHover(pctFromEvent(e.clientX));
      }}
      onPointerMove={(e) => !dragging && onHover(pctFromEvent(e.clientX))}
      onPointerLeave={() => !dragging && onHover(null)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round((pct / 100) * duration)}
      aria-valuetext={formatDuration((pct / 100) * duration)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSeek(((pct - 2) / 100) * duration);
        if (e.key === 'ArrowRight') onSeek(((pct + 2) / 100) * duration);
      }}
    >
      <div ref={trackRef} className={cn('relative flex w-full gap-[2px]', compact ? 'h-[3px]' : 'h-[4px]')}>
        {segments.map((seg, i) => (
          <div
            key={i}
            className="relative h-full overflow-hidden rounded-full bg-cream/20 transition-[height] duration-200 group-hover/scrub:h-full"
            style={{ width: `${seg.width}%` }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-cream/25"
              style={{ width: `${clampSegment(buffered, seg.start, seg.width)}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-flare"
              style={{ width: `${clampSegment(pct, seg.start, seg.width)}%` }}
            />
            {previewPct !== null && (
              <div
                className="absolute inset-y-0 left-0 bg-cream/25"
                style={{ width: `${clampSegment(previewPct, seg.start, seg.width)}%` }}
              />
            )}
          </div>
        ))}

        {/* Playhead */}
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-flare',
            'shadow-[0_0_0_4px_rgba(255,74,46,0.2)] transition-transform duration-200',
            compact ? 'scale-0' : 'scale-0 group-hover/scrub:scale-100',
            dragging && 'scale-125',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>

      {/* Scrub preview */}
      <AnimatePresence>
        {previewPct !== null && !compact && duration > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none absolute bottom-6 z-20 -translate-x-1/2"
            style={{ left: `clamp(3rem, ${previewPct}%, calc(100% - 3rem))` }}
          >
            <div className="rounded-lg border border-line-strong chrome px-2 py-1 text-center shadow-lift">
              <span className="block font-mono text-[11px] font-medium text-cream tnum">
                {formatDuration((previewPct / 100) * duration)}
              </span>
              {hoveredChapter && (
                <span className="mt-0.5 block max-w-[13rem] truncate text-[10.5px] text-muted">
                  {hoveredChapter.label}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** How much of a segment a global percentage fills. */
function clampSegment(globalPct: number, start: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(100, ((globalPct - start) / width) * 100));
}

function VolumeControl({
  muted, volume, onToggle, onChange,
}: { muted: boolean; volume: number; onToggle(): void; onChange(v: number): void }) {
  const Icon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  return (
    <div className="group/vol flex items-center">
      <Ctl label={muted ? 'Unmute (m)' : 'Mute (m)'} onClick={onToggle}>
        <Icon className="h-[18px] w-[18px]" />
      </Ctl>
      <div className="w-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/vol:w-20 group-focus-within/vol:w-20">
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volume}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Volume"
          className="range-flare ml-1 w-[4.5rem]"
        />
      </div>
    </div>
  );
}

function MenuRow({ label, value, onClick }: { label: string; value: string; onClick(): void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-cream/[0.07]"
    >
      <span className="text-[13px] text-cream">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate text-[12px] text-muted">{value}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
      </span>
    </button>
  );
}

function SubPanel({
  title, onBack, children,
}: { title: string; onBack(): void; children: React.ReactNode }) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex w-full items-center gap-1.5 border-b border-line px-2.5 py-2.5 text-left transition-colors hover:bg-cream/[0.05]"
      >
        <ChevronLeft className="h-3.5 w-3.5 text-muted" />
        <span className="text-[12.5px] font-medium text-cream">{title}</span>
      </button>
      <div className="max-h-60 overflow-y-auto p-1">{children}</div>
    </div>
  );
}

function MenuOption({
  label, hint, selected, onClick,
}: { label: string; hint?: string; selected: boolean; onClick(): void }) {
  return (
    <button
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
        selected ? 'text-flare' : 'text-cream-dim hover:bg-cream/[0.07] hover:text-cream',
      )}
    >
      <Check className={cn('h-3.5 w-3.5 shrink-0', !selected && 'opacity-0')} />
      <span className="truncate text-[12.5px]">{label}</span>
      {hint && <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{hint}</span>}
    </button>
  );
}

function Ctl({
  children, label, onClick, active, small, className,
}: {
  children: React.ReactNode; label: string; onClick(): void;
  active?: boolean; small?: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-lg text-cream-dim',
        'transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:bg-cream/12 hover:text-cream active:scale-90',
        small ? 'h-6 w-6' : 'h-9 w-9',
        active && 'text-flare',
        className,
      )}
    >
      {children}
    </button>
  );
}
