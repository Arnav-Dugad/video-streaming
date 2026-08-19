'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, Check, ChevronDown, Loader2, Mic, MicOff, PhoneOff, Radio,
  Stethoscope, Volume2, X,
} from 'lucide-react';

import { VoiceMesh, explainVoiceError, hasTurn, type VoicePeer } from '@/lib/voice';
import { firestoreTransport } from '@/lib/voice-transport';
// `Check` is aliased: the lucide icon of the same name is already in scope.
import {
  playTestTone, runVoiceSelfTest, type Check as CheckResult, type SelfTest,
} from '@/lib/voice-selftest';
import { useVoiceUi } from '@/lib/voice-store';
import { Avatar } from '@/components/ui/Avatar';
import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Room } from '@/lib/types';

/* ==========================================================================
   Talking over the film.

   Off by default and joined explicitly: opening a link should never switch on
   somebody's microphone. Once in, the rail is a row of faces that light when
   their owner speaks, and the video ducks under whoever is talking — which is
   the thing that makes voice feel like being in a room rather than being on a
   call with a film playing somewhere behind it.
   ========================================================================== */

interface Props {
  room: Room;
  uid: string;
}

export function VoiceRail({ room, uid }: Props) {
  const [state, setState] = useState<'off' | 'joining' | 'on'>('off');
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [muted, setMuted] = useState(false);
  const [selfLevel, setSelfLevel] = useState(0);
  const [fault, setFault] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState(false);
  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<SelfTest | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [tone, setTone] = useState<CheckResult | null>(null);
  const [toning, setToning] = useState(false);

  const mesh = useRef<VoiceMesh | null>(null);
  const setActive = useVoiceUi((s) => s.setActive);
  const setSomeoneSpeaking = useVoiceUi((s) => s.setSomeoneSpeaking);

  const leave = useCallback(() => {
    const live = mesh.current;
    mesh.current = null;
    setState('off');
    setPeers([]);
    setMuted(false);
    setSelfLevel(0);
    setFault(null);
    setBlocked(false);
    setActive(false);
    live?.stop().catch(() => {});
  }, [setActive]);

  // Closing the tab, navigating away, or the room disappearing all have to
  // hang up — a peer left ringing is worse than one that never connected.
  useEffect(() => () => { mesh.current?.stop().catch(() => {}); }, []);

  useEffect(() => {
    const hangUp = () => { mesh.current?.stop().catch(() => {}); };
    window.addEventListener('pagehide', hangUp);
    return () => window.removeEventListener('pagehide', hangUp);
  }, []);

  const join = async () => {
    if (state !== 'off') return;
    setFault(null);
    setState('joining');

    const live = new VoiceMesh(uid, firestoreTransport(room.id, uid), {
      onPeers: setPeers,
      onSpeaking: setSomeoneSpeaking,
      onSelfLevel: setSelfLevel,
      onError: (message) => {
        // Kept on screen as well as toasted: a signalling failure is the one
        // thing that makes voice look broken for no visible reason.
        setFault(message);
        toast(message, { tone: 'error' });
      },
      onPlaybackBlocked: setBlocked,
    });

    try {
      await live.start();
      mesh.current = live;
      setState('on');
      setActive(true);
    } catch (err) {
      await live.stop().catch(() => {});
      setState('off');
      const name = (err as { name?: string }).name;
      // Microphone problems and signalling problems have completely different
      // remedies, so they are never collapsed into one message.
      const message =
        name === 'NotAllowedError'
          ? 'Your browser blocked the microphone. Allow it in the address bar and try again.'
          : name === 'NotFoundError'
            ? 'No microphone found on this device'
            : name === 'NotReadableError'
              ? 'Another application is holding the microphone. Close it and try again.'
              : explainVoiceError(err as Error);
      setFault(message);
      toast(message, { tone: 'error' });
    }
  };

  /* Three failures look identical from the outside and have three different
     fixes. Rather than have somebody guess, this checks each one directly. */
  const selfTest = async () => {
    if (testing) return;
    setTesting(true);
    setReport(null);
    try {
      setReport(await runVoiceSelfTest(firestoreTransport(room.id, uid), uid));
    } catch (err) {
      toast((err as Error).message || 'The self-test could not run', { tone: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const testSound = async () => {
    if (toning) return;
    setToning(true);
    setTone(null);
    try { setTone(await playTestTone()); } finally { setToning(false); }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mesh.current?.setMuted(next);
  };

  const failed = peers.filter((p) => p.status === 'failed');
  const connecting = peers.filter((p) => p.status === 'connecting');

  return (
    <section className="rounded-xl border border-line px-4 py-3" aria-label="Voice">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow flex items-center gap-1.5">
          <Radio className={cn('h-3 w-3 transition-colors', state === 'on' ? 'text-flare' : 'text-faint')} />
          Voice
        </span>

        {state === 'on' && (
          <div className="flex flex-wrap items-center gap-2">
            <Face
              name="You"
              photo={room.members?.[uid]?.photo ?? null}
              level={muted ? 0 : selfLevel}
              speaking={!muted && selfLevel > 0.045}
              muted={muted}
              status="connected"
            />
            {peers.map((p) => (
              <Face
                key={p.uid}
                name={room.members?.[p.uid]?.name ?? 'Someone'}
                photo={room.members?.[p.uid]?.photo ?? null}
                level={p.level}
                speaking={p.speaking}
                muted={p.muted}
                status={p.status}
              />
            ))}
            {peers.length === 0 && (
              <span className="text-[12px] text-faint">
                You are the only one on voice — invite somebody in.
              </span>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Available whether or not voice is running: it is just as useful
              for "it will not start" as for "they never connect". */}
          <button
            onClick={selfTest}
            disabled={testing}
            aria-label="Check why voice is not connecting"
            title="Check why voice is not connecting"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-[background-color,color,transform] duration-200 hover:bg-cream/10 hover:text-cream active:scale-90 disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
          </button>

          {state === 'on' ? (
            <>
              <button
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? 'Unmute your microphone' : 'Mute your microphone'}
                title={muted ? 'Unmute' : 'Mute'}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-lg transition-[background-color,color,transform] duration-200 active:scale-90',
                  muted ? 'bg-flare/15 text-flare' : 'text-cream-dim hover:bg-cream/10 hover:text-cream',
                )}
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                onClick={leave}
                aria-label="Leave voice"
                title="Leave voice"
                className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-[background-color,color,transform] duration-200 hover:bg-flare/15 hover:text-flare active:scale-90"
              >
                <PhoneOff className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={join}
              disabled={state === 'joining'}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[12.5px] text-cream-dim transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.05] disabled:opacity-60"
            >
              {state === 'joining'
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting</>
                : <><Mic className="h-3.5 w-3.5" /> Join voice</>}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {state === 'on' && (connecting.length > 0 || failed.length > 0) && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 flex items-start gap-1.5 overflow-hidden text-[11.5px] leading-relaxed text-faint"
          >
            {failed.length > 0 ? (
              <>
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-flare" />
                <span>
                  Could not reach {failed.map((p) => room.members?.[p.uid]?.name ?? 'someone').join(', ')}.
                  {!hasTurn && ' Some networks need a relay to connect two people directly — set the TURN variables on this deployment to cover them.'}
                </span>
              </>
            ) : (
              <span>Connecting to {connecting.length} {connecting.length === 1 ? 'person' : 'people'}…</span>
            )}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Autoplay policy will not be argued with, only tapped. A phone that
          refuses incoming audio produces a perfect connection with silence
          coming out of it, so this asks for the one thing that fixes it. */}
      <AnimatePresence>
        {state === 'on' && blocked && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onClick={() => mesh.current?.resumePlayback()}
            className="mt-2 flex w-full items-center gap-2 overflow-hidden rounded-lg bg-flare/[0.12] px-3 py-2.5 text-left transition-colors hover:bg-flare/[0.18]"
          >
            <Volume2 className="h-4 w-4 shrink-0 text-flare" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-cream">Tap to hear the room</span>
              <span className="block text-[11.5px] leading-relaxed text-cream-dim">
                Your browser is holding the incoming audio until you ask for it.
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* The self-test report. Ordered the way the failures have to be fixed
          in, with the one sentence worth reading at the bottom. */}
      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 overflow-hidden"
          >
            <div className="rounded-xl border border-line bg-ink-850 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="eyebrow">Self-test</p>
                <button
                  onClick={() => setReport(null)}
                  aria-label="Dismiss the self-test"
                  className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:text-cream"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <ul className="space-y-1.5">
                {[report.microphone, report.signalling, report.network].map((check) => (
                  <li key={check.label} className="flex items-start gap-2">
                    {check.ok
                      ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" />
                      : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flare" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] text-cream-dim">{check.label}</span>
                      <span className="block text-[11.5px] leading-relaxed text-faint">{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                candidates · host {report.candidates.host} · public {report.candidates.srflx} · relay {report.candidates.relay}
              </p>

              {/* The exact URLs that were tried, so a typo in an environment
                  variable is something you can see rather than deduce. */}
              {report.turnUrls.length > 0 && (
                <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-faint">
                  {report.turnUrls.map((u) => (
                    <li key={u} className="truncate">relay · {u}</li>
                  ))}
                </ul>
              )}

              {/* Two relay URLs are always tried — UDP and TCP — and one of
                  them failing while the other works is normal and harmless.
                  Painting that red made a working setup look broken. */}
              {report.iceErrors.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {report.iceErrors.map((e) => (
                    <li
                      key={e}
                      className={cn(
                        'text-[11px] leading-relaxed',
                        report.candidates.relay > 0 ? 'text-faint' : 'text-flare',
                      )}
                    >
                      {report.candidates.relay > 0 && 'ignored · '}{e}
                    </li>
                  ))}
                </ul>
              )}

              {/* Nothing else can tell you whether the speaker works. */}
              <div className="mt-2.5 border-t border-line pt-2.5">
                <button
                  onClick={testSound}
                  disabled={toning}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-[12px] text-cream-dim transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.05] disabled:opacity-60"
                >
                  {toning
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Playing…</>
                    : <><Volume2 className="h-3.5 w-3.5" /> Play a test sound</>}
                </button>
                {tone && (
                  <p className={cn('mt-1.5 text-[11.5px] leading-relaxed', tone.ok ? 'text-faint' : 'text-flare')}>
                    {tone.detail}
                  </p>
                )}
              </div>

              <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-cream">
                {report.verdict}
              </p>
              {report.remedy && (
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-flare">{report.remedy}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A signalling failure is the one thing that makes voice look broken
          for no visible reason, so it is stated plainly and stays on screen
          with the remedy in it. */}
      {fault && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-flare/[0.07] px-2.5 py-2 text-[11.5px] leading-relaxed text-flare">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{fault}</span>
        </p>
      )}

      {state === 'on' && peers.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setDiagnostics((v) => !v)}
            aria-expanded={diagnostics}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint transition-colors hover:text-cream-dim"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform duration-300', diagnostics && 'rotate-180')} />
            Connection detail
          </button>

          <AnimatePresence>
            {diagnostics && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="mt-1.5 space-y-0.5 overflow-hidden font-mono text-[10.5px] text-faint"
              >
                {peers.map((p) => (
                  <li key={p.uid} className="flex items-center gap-2">
                    <span className="w-28 truncate text-cream-dim">
                      {room.members?.[p.uid]?.name ?? p.uid.slice(0, 8)}
                    </span>
                    <span className={cn(
                      p.status === 'connected' ? 'text-mint'
                        : p.status === 'failed' ? 'text-flare' : 'text-muted',
                    )}>
                      {p.status}
                    </span>
                    <span>{p.detail}</span>
                    {p.attempts > 1 && <span>· try {p.attempts}</span>}
                    {/* The decisive number. Bytes climbing with nothing
                        audible is a speaker problem; bytes stuck at zero is a
                        media problem, and they share no fix. */}
                    <span className={p.inboundBytes > 0 ? 'text-mint' : 'text-flare'}>
                      · {p.inboundBytes > 0 ? `${(p.inboundBytes / 1024).toFixed(1)} kB in` : 'no audio in'}
                    </span>
                    {p.inboundBytes > 0 && !p.playing && (
                      <span className="text-flare">· not playing</span>
                    )}
                    {p.muted && <span className="text-muted">· they are muted</span>}
                  </li>
                ))}
                <li className="pt-1">relay configured: {hasTurn ? 'yes' : 'no (STUN only)'}</li>
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {state === 'off' && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
          Talk over the film instead of typing under it. Peer to peer — the audio
          goes straight between you, and the video ducks under whoever speaks.
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Face({
  name, photo, level, speaking, muted, status,
}: {
  name: string; photo: string | null; level: number;
  speaking: boolean; muted: boolean; status: VoicePeer['status'];
}) {
  return (
    <span
      className="relative flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 transition-colors duration-300"
      style={{
        borderColor: speaking ? 'var(--color-flare)' : 'var(--color-line)',
        // The ring grows with the level rather than blinking on a threshold,
        // so a room reads as a mixing desk rather than a set of traffic lights.
        boxShadow: speaking ? `0 0 0 ${1 + Math.min(level, 0.4) * 10}px rgb(255 74 46 / 0.10)` : 'none',
      }}
      title={status === 'failed' ? `Could not connect to ${name}` : name}
    >
      <span className="relative">
        <Avatar src={photo} name={name} size={22} />
        {status === 'connecting' && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-ink-950/70">
            <Loader2 className="h-3 w-3 animate-spin text-flare" />
          </span>
        )}
        {status === 'failed' && (
          <span className="absolute -bottom-0.5 -right-0.5 grid h-3 w-3 place-items-center rounded-full bg-ink-900">
            <AlertTriangle className="h-2.5 w-2.5 text-flare" />
          </span>
        )}
      </span>
      <span className={cn('text-[12px] transition-colors', speaking ? 'text-cream' : 'text-cream-dim')}>
        {name}
      </span>
      {muted && <MicOff className="h-3 w-3 text-faint" aria-label={`${name} is muted`} />}
    </span>
  );
}
