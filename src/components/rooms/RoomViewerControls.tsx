'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Captions, Check, ChevronLeft, Loader2, Maximize, Minimize, Settings,
  Volume1, Volume2, VolumeX,
} from 'lucide-react';

import {
  activeCaptionTrack, applyQuality, availableQualities, getCaptionTracks,
  loadCaptionModule, preferredTrack, qualityLabel,
  setCaptionTrack as applyCaptionTrack, type CaptionTrack,
} from '@/lib/player-modules';
import { toast } from '@/lib/store';
import { DUCK_FACTOR, useVoiceUi } from '@/lib/voice-store';
import { cn } from '@/lib/cn';
import type { YTPlayer } from '@/hooks/useYouTubeApi';

/* ==========================================================================
   The controls a guest keeps.

   Being in someone else's room means giving up the transport — play, pause
   and the scrubber belong to the host, because those are the things that have
   to match. Everything else is personal and nobody else can feel it: how loud
   it is, whether subtitles are on, which rendition your connection can carry,
   and whether the video fills your screen. Taking those away too is what makes
   a synced player feel like a hostage situation rather than a shared one.
   ========================================================================== */

interface Props {
  api(): YTPlayer | null;
  ready: boolean;
  /** The element that goes fullscreen — the player's own box. */
  surfaceRef: RefObject<HTMLElement | null>;
  /** Bumped whenever the room's video changes, so the menus re-read. */
  videoId: string;
}

export function RoomViewerControls({ api, ready, surfaceRef, videoId }: Props) {
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<null | 'root' | 'quality' | 'captions'>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const [qualities, setQualities] = useState<string[]>([]);
  const [quality, setQuality] = useState('auto');
  const [actualQuality, setActualQuality] = useState('auto');
  const [applying, setApplying] = useState(false);

  const [tracks, setTracks] = useState<CaptionTrack[]>([]);
  const [track, setTrack] = useState<string | null>(null);

  /* --------------------------- fullscreen ------------------------------- */

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = surfaceRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      toast('This browser would not allow fullscreen', { tone: 'error' });
    }
  }, [surfaceRef]);

  /* ----------------------- modules, per video --------------------------- */

  const refresh = useCallback(() => {
    const p = api();
    if (!p) return;
    setQualities(availableQualities(p));
    setTracks(getCaptionTracks(p));
    setTrack(activeCaptionTrack(p));
  }, [api]);

  // Renditions and subtitle tracks belong to a video, not to a player, so they
  // are re-read whenever the room moves on rather than carried over.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const p = api();
    if (!p) return;
    if (loadedFor.current !== videoId) {
      loadedFor.current = videoId;
      loadCaptionModule(p);
    }
    // The player only knows its levels once playback has actually started.
    const t = setTimeout(refresh, 1200);
    return () => clearTimeout(t);
  }, [ready, videoId, api, refresh]);

  /* ------------------------------ volume -------------------------------- */

  /* Ducking. `volume` stays the level the viewer actually chose; what reaches
     the player is that level scaled by whether anybody is talking. Writing the
     ducked value into state instead would mean the slider crept downwards
     every time someone spoke, and the original level would be lost. */
  const ducked = useVoiceUi((s) => s.active && s.someoneSpeaking);

  const applyVolume = useCallback((level: number, duck: boolean) => {
    const p = api();
    if (!p) return;
    p.setVolume(Math.round(level * (duck ? DUCK_FACTOR : 1)));
  }, [api]);

  useEffect(() => {
    if (muted) return;
    applyVolume(volume, ducked);
  }, [ducked, volume, muted, applyVolume]);

  const changeVolume = (v: number) => {
    const p = api();
    setVolume(v);
    setMuted(v === 0);
    applyVolume(v, ducked);
    if (v === 0) p?.mute(); else p?.unMute();
  };

  const toggleMute = () => {
    const p = api();
    if (muted || volume === 0) {
      const restored = volume || 60;
      p?.unMute();
      applyVolume(restored, ducked);
      setVolume(restored);
      setMuted(false);
    } else {
      p?.mute();
      setMuted(true);
    }
  };

  /* ----------------------------- quality -------------------------------- */

  const chooseQuality = async (id: string) => {
    const p = api();
    if (!p) return;
    setQuality(id);
    setApplying(true);
    const { outcome, actual } = await applyQuality(p, id);
    setActualQuality(actual);
    setApplying(false);
    setPanel(null);
    // Say what really happened. YouTube's adaptive streaming overrides a
    // requested rendition often enough that a silent checkmark would be a lie.
    if (outcome === 'overridden') {
      toast(`Your connection is being served ${qualityLabel(actual)}`);
    } else if (outcome === 'unsupported') {
      toast('This player would not change rendition', { tone: 'error' });
    }
  };

  /* ---------------------------- captions -------------------------------- */

  const chooseTrack = (code: string | null) => {
    const p = api();
    if (!p) return;
    applyCaptionTrack(p, code);
    setTrack(code);
    setPanel(null);
  };

  const toggleCaptions = () => {
    if (track) { chooseTrack(null); return; }
    const p = api();
    if (!p) return;
    const list = tracks.length > 0 ? tracks : getCaptionTracks(p);
    if (list.length === 0) { toast('No subtitles published for this video'); return; }
    setTracks(list);
    chooseTrack(preferredTrack(list)?.languageCode ?? list[0].languageCode);
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className="flex items-center gap-1">
      {/* ------------------------------ volume ---------------------------- */}
      <div className="group/vol flex items-center">
        <Ctl onClick={toggleMute} label={muted ? 'Unmute' : 'Mute'}>
          <VolumeIcon className="h-4 w-4" />
        </Ctl>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          aria-label="Volume"
          className="room-vol h-1 w-0 cursor-pointer opacity-0 transition-[width,opacity,margin] duration-300 focus-visible:ml-2 focus-visible:w-16 focus-visible:opacity-100 group-hover/vol:ml-2 group-hover/vol:w-16 group-hover/vol:opacity-100"
          style={{ accentColor: 'var(--color-flare)' }}
        />
      </div>

      <Ctl onClick={toggleCaptions} label={track ? 'Subtitles off' : 'Subtitles'} active={Boolean(track)}>
        <Captions className="h-4 w-4" />
      </Ctl>

      {/* ----------------------------- settings --------------------------- */}
      <div className="relative">
        <Ctl
          onClick={() => { setPanel(panel ? null : 'root'); refresh(); }}
          label="Playback settings"
          active={panel !== null}
        >
          {applying
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Settings className="h-4 w-4" />}
        </Ctl>

        <AnimatePresence>
          {panel && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPanel(null)} aria-hidden />
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="absolute bottom-11 right-0 z-50 w-56 origin-bottom-right overflow-hidden rounded-xl border border-line bg-ink-900/95 backdrop-blur-md"
              >
                {panel === 'root' && (
                  <div className="p-1">
                    <Row label="Quality" value={qualityLabel(quality === 'auto' ? actualQuality : quality)}
                      hint={quality === 'auto' ? 'Auto' : undefined}
                      onClick={() => setPanel('quality')} />
                    <Row label="Subtitles"
                      value={track ? (tracks.find((t) => t.languageCode === track)?.languageName ?? track) : 'Off'}
                      onClick={() => setPanel('captions')} />
                  </div>
                )}

                {panel === 'quality' && (
                  <Pane title="Quality" onBack={() => setPanel('root')}>
                    <Option label="Auto" detail={actualQuality !== 'auto' ? qualityLabel(actualQuality) : undefined}
                      selected={quality === 'auto'} onClick={() => chooseQuality('auto')} />
                    {qualities.map((q) => (
                      <Option key={q} label={qualityLabel(q)} selected={quality === q}
                        onClick={() => chooseQuality(q)} />
                    ))}
                    {qualities.length === 0 && (
                      <p className="px-3 py-3 text-[11.5px] leading-relaxed text-faint">
                        The player has not reported its renditions yet. Give it a second of playback.
                      </p>
                    )}
                  </Pane>
                )}

                {panel === 'captions' && (
                  <Pane title="Subtitles" onBack={() => setPanel('root')}>
                    <Option label="Off" selected={track === null} onClick={() => chooseTrack(null)} />
                    {tracks.map((t) => (
                      <Option
                        key={t.languageCode}
                        label={t.languageName}
                        detail={t.isAuto ? 'auto' : undefined}
                        selected={track === t.languageCode}
                        onClick={() => chooseTrack(t.languageCode)}
                      />
                    ))}
                    {tracks.length === 0 && (
                      <p className="px-3 py-3 text-[11.5px] leading-relaxed text-faint">
                        No subtitle tracks published for this video.
                      </p>
                    )}
                  </Pane>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <Ctl onClick={toggleFullscreen} label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
        {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </Ctl>
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */

function Ctl({
  children, onClick, label, active,
}: { children: React.ReactNode; onClick(): void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-[background-color,color,transform] duration-200',
        'hover:bg-cream/10 hover:text-cream active:scale-90',
        active ? 'text-flare' : 'text-cream-dim',
      )}
    >
      {children}
    </button>
  );
}

function Row({
  label, value, hint, onClick,
}: { label: string; value: string; hint?: string; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-cream/[0.06]"
    >
      <span className="text-[12.5px] text-cream-dim">{label}</span>
      <span className="flex items-center gap-1 font-mono text-[11px] text-faint">
        {hint && <span className="text-flare">{hint}</span>}
        {value}
      </span>
    </button>
  );
}

function Pane({
  title, onBack, children,
}: { title: string; onBack(): void; children: React.ReactNode }) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex w-full items-center gap-1.5 border-b border-line px-2.5 py-2 text-left transition-colors hover:bg-cream/[0.05]"
      >
        <ChevronLeft className="h-3.5 w-3.5 text-muted" />
        <span className="eyebrow">{title}</span>
      </button>
      <div className="max-h-56 overflow-y-auto p-1">{children}</div>
    </div>
  );
}

function Option({
  label, detail, selected, onClick,
}: { label: string; detail?: string; selected: boolean; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-cream/[0.06]"
    >
      <Check className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-flare' : 'opacity-0')} />
      <span className={cn('flex-1 truncate text-[12.5px]', selected ? 'text-cream' : 'text-cream-dim')}>
        {label}
      </span>
      {detail && <span className="shrink-0 font-mono text-[10px] text-faint">{detail}</span>}
    </button>
  );
}
