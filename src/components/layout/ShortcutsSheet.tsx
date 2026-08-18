'use client';

import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

import { useUI } from '@/lib/store';
import { useKeyboard } from '@/hooks/useKeyboard';

const GROUPS = [
  {
    heading: 'Everywhere',
    items: [
      ['⌘ K', 'Open the command palette'],
      ['/', 'Focus search'],
      ['?', 'This sheet'],
      ['esc', 'Close any overlay'],
    ],
  },
  {
    heading: 'Playback',
    items: [
      ['space  ·  K', 'Play or pause'],
      ['J  ·  L', 'Back / forward 10s'],
      ['← →', 'Back / forward 5s'],
      ['↑ ↓', 'Volume'],
      ['0 – 9', 'Jump to 0–90%'],
      ['M', 'Mute'],
      ['C', 'Captions'],
      ['F', 'Fullscreen'],
      ['T', 'Theatre mode'],
      ['⇧ N', 'Play next in queue'],
      ['⇧ , / ⇧ .', 'Slower / faster'],
    ],
  },
];

export function ShortcutsSheet() {
  const open = useUI((s) => s.shortcutsOpen);
  const toggle = useUI((s) => s.toggleShortcuts);

  useKeyboard([{ key: '?', shift: true, run: toggle }], true);
  useKeyboard([{ key: 'escape', whileTyping: true, run: toggle }], open);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[190] grid place-items-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink-950/75 backdrop-blur-md"
            onClick={toggle}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-ink-900 shadow-float"
          >
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="display text-xl text-cream">Keyboard shortcuts</h2>
              <button onClick={toggle} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-cream/10 hover:text-cream">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid gap-8 p-6 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <section key={g.heading}>
                  <h3 className="eyebrow mb-3">{g.heading}</h3>
                  <ul className="space-y-2">
                    {g.items.map(([keys, label]) => (
                      <li key={keys} className="flex items-baseline justify-between gap-6">
                        <span className="text-[13px] text-cream-dim">{label}</span>
                        <kbd className="shrink-0 rounded-md border border-line px-2 py-0.5 font-mono text-[10.5px] text-muted">
                          {keys}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
