'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { sendReaction, watchRoomReactions } from '@/lib/db';
import type { RoomReaction } from '@/lib/types';

/* ==========================================================================
   Reactions, over the video.

   Chat pulls your eyes off the screen; a reaction does not. These float up
   from the corner where they were sent, carrying the sender's name, and are
   gone in three seconds.

   Only reactions that arrive *after* this component mounts ever float. The
   listener hands back the last thirty on connect, and a wall of stale emoji
   on entering a room would be nonsense.
   ========================================================================== */

const PALETTE = ['🔥', '😂', '😮', '❤️', '👏', '💀'] as const;
const LIFETIME_MS = 3200;

interface Props {
  roomId: string;
  uid: string;
  name: string;
  currentSecond: number;
}

export function RoomReactions({ roomId, uid, name, currentSecond }: Props) {
  const [floating, setFloating] = useState<RoomReaction[]>([]);
  const [open, setOpen] = useState(false);
  const mountedAt = useRef(0);
  const seen = useRef(new Set<string>());
  const second = useRef(currentSecond);

  useEffect(() => { second.current = currentSecond; }, [currentSecond]);

  useEffect(() => {
    mountedAt.current = Date.now();
    const stop = watchRoomReactions(roomId, (all) => {
      const fresh = all.filter(
        (r) => r.at > mountedAt.current && !seen.current.has(r.id),
      );
      if (fresh.length === 0) return;
      for (const r of fresh) seen.current.add(r.id);
      setFloating((prev) => [...prev, ...fresh]);

      // Each one clears itself; a room left open for an hour must not
      // accumulate a thousand mounted nodes.
      for (const r of fresh) {
        setTimeout(() => {
          setFloating((prev) => prev.filter((f) => f.id !== r.id));
        }, LIFETIME_MS);
      }
    });
    return stop;
  }, [roomId]);

  const send = (emoji: string) => {
    sendReaction(roomId, { uid, name, emoji, atSecond: Math.round(second.current) })
      .catch(() => { /* a dropped reaction is not worth a toast */ });
  };

  return (
    <>
      {/* --------------------------- the floats --------------------------- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <AnimatePresence>
          {floating.map((r) => (
            <motion.div
              key={r.id}
              // A deterministic lane per reaction id: same emoji from the same
              // person twice in a row still drifts differently, without any
              // render-time randomness to break hydration.
              style={{ right: `${6 + (hash(r.id) % 34)}%` }}
              className="absolute bottom-14 flex items-center gap-1.5"
              initial={{ opacity: 0, y: 10, scale: 0.6 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [10, -60, -130, -190],
                scale: [0.6, 1.15, 1, 0.9],
                x: [0, (hash(r.id) % 2 ? 1 : -1) * 14, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: LIFETIME_MS / 1000, ease: [0.22, 1, 0.36, 1], times: [0, 0.18, 0.62, 1] }}
            >
              <span className="text-[26px] leading-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">{r.emoji}</span>
              <span className="rounded-full bg-ink-950/70 px-2 py-0.5 text-[10.5px] text-cream-dim backdrop-blur-sm">
                {r.uid === uid ? 'You' : r.name}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ---------------------------- the rail ---------------------------- */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-1.5"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: 14, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 14, scale: 0.9 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-0.5 rounded-full border border-line bg-ink-950/85 px-1.5 py-1 backdrop-blur-md"
            >
              {PALETTE.map((emoji, i) => (
                <motion.button
                  key={emoji}
                  onClick={() => send(emoji)}
                  aria-label={`React ${emoji}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.028, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ scale: 1.28, y: -2 }}
                  whileTap={{ scale: 0.85 }}
                  className="grid h-7 w-7 place-items-center rounded-full text-[15px] transition-colors hover:bg-cream/10"
                >
                  {emoji}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => (open ? send(PALETTE[0]) : setOpen(true))}
          aria-label="Reactions"
          aria-expanded={open}
          className="grid h-8 w-8 place-items-center rounded-full border border-line bg-ink-950/85 text-[14px] backdrop-blur-md transition-[border-color,transform] duration-300 hover:border-line-strong active:scale-90"
        >
          😀
        </button>
      </div>
    </>
  );
}

/** Stable small integer from a Firestore id. */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
