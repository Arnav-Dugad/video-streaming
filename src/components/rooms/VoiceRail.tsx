'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Loader2, Mic, MicOff, PhoneOff, Radio } from 'lucide-react';

import { VoiceMesh, hasTurn, type VoicePeer } from '@/lib/voice';
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
    setState('joining');

    const live = new VoiceMesh(room.id, uid, {
      onPeers: setPeers,
      onSpeaking: setSomeoneSpeaking,
      onSelfLevel: setSelfLevel,
      onError: (message) => toast(message, { tone: 'error' }),
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
      toast(
        name === 'NotAllowedError'
          ? 'Your browser blocked the microphone. Allow it in the address bar and try again.'
          : name === 'NotFoundError'
            ? 'No microphone found on this device'
            : 'Could not start voice',
        { tone: 'error' },
      );
    }
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
