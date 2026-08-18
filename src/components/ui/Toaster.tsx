'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { useToasts } from '@/lib/store';
import { cn } from '@/lib/cn';

const ICONS = {
  neutral: Info,
  success: Check,
  error: TriangleAlert,
} as const;

const TONES = {
  neutral: 'text-cream-dim',
  success: 'text-mint',
  error: 'text-flare',
} as const;

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[9000] flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 22, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line-strong chrome px-3.5 py-3 shadow-float"
            >
              <Icon className={cn('h-4 w-4 shrink-0', TONES[t.tone])} strokeWidth={2} />
              <p className="flex-1 text-[13px] leading-snug text-cream">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => { t.action!.run(); dismiss(t.id); }}
                  className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-flare transition-colors hover:bg-flare/10"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint transition-colors hover:text-cream"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
