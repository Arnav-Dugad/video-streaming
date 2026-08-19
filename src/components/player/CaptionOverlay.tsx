'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { usePlayer } from '@/lib/store';
import { cueAt } from '@/lib/captions';

/* ==========================================================================
   Subtitles, drawn in the page.

   YouTube paints its own captions at the foot of the embed, which is where our
   control bar lives — so every time the bar came up, the dialogue went behind
   it. The embed is cross-origin, so there is no stylesheet we can reach in to
   move them with.

   When the cue text can be fetched (see api/captions) we switch YouTube's own
   captions off and render them here instead, which puts their position under
   our control: they ride just above the control bar while it is on screen and
   settle back down when it hides. When the cues cannot be fetched, this
   renders nothing and YouTube keeps drawing its own — the same behaviour as
   before, rather than no subtitles at all.
   ========================================================================== */

/** Roughly the height of the control bar, plus a little air. */
const LIFT = 78;
const RESTING = 24;

export function CaptionOverlay({ compact }: { compact?: boolean }) {
  const cues = usePlayer((s) => s.cues);
  const position = usePlayer((s) => s.position);
  const controlsVisible = usePlayer((s) => s.controlsVisible);

  const cue = useMemo(() => (cues.length > 0 ? cueAt(cues, position) : null), [cues, position]);

  if (!cue) return null;

  // The dock is too small to letter-box dialogue into; it would cover the
  // frame it is meant to be captioning.
  if (compact) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-[6%] transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ paddingBottom: controlsVisible ? LIFT : RESTING }}
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        <motion.p
          key={`${cue.start}-${cue.text}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="max-w-[46ch] text-balance rounded-lg bg-black/72 px-3 py-1.5 text-center text-[clamp(0.85rem,1.7vw,1.4rem)] font-medium leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
        >
          {cue.text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
