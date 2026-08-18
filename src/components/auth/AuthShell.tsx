'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { PrismMark } from '@/components/layout/Logo';

/* ==========================================================================
   Auth layout.

   A two-column split: the form on the left at a comfortable reading measure,
   and a slow-moving field of light on the right. The right column is purely
   atmospheric and is hidden below `lg` rather than stacked — a decorative
   panel above a form on a phone is just something to scroll past.
   ========================================================================== */

const QUOTES = [
  {
    line: 'The best thing about the internet is that somebody, somewhere, filmed it.',
    who: 'PRISM',
  },
];

export function AuthShell({
  title, lede, children, footer,
}: { title: string; lede: string; children: ReactNode; footer: ReactNode }) {
  const quote = QUOTES[0];

  return (
    <div className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-2">
      {/* ------------------------------ form ------------------------------- */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
            <PrismMark className="h-6 w-6 text-cream" />
            <span className="text-[15px] font-semibold uppercase tracking-[0.22em] text-cream">Prism</span>
          </Link>

          <h1 className="display text-[clamp(1.9rem,4vw,2.6rem)] text-cream">{title}</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{lede}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-8 border-t border-line pt-6 text-[13px] text-muted">{footer}</div>
        </motion.div>
      </div>

      {/* ---------------------------- atmosphere --------------------------- */}
      <aside className="relative hidden overflow-hidden border-l border-line lg:block" aria-hidden>
        <motion.div
          className="absolute inset-0"
          animate={{ scale: [1, 1.12, 1], x: ['-2%', '2%', '-2%'], y: ['1%', '-2%', '1%'] }}
          transition={{ duration: 34, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(48% 58% at 22% 26%, rgba(255,74,46,0.32), transparent 62%),' +
              'radial-gradient(44% 52% at 76% 34%, rgba(157,180,255,0.22), transparent 60%),' +
              'radial-gradient(60% 60% at 52% 84%, rgba(255,119,87,0.18), transparent 64%)',
          }}
        />
        <div className="absolute inset-0 backdrop-blur-[100px]" />
        {/* Refraction lines — the prism motif, once, at full scale. */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 600 800" fill="none" preserveAspectRatio="xMidYMid slice">
          <path d="M300 180 L470 520 H130 L300 180Z" stroke="#F4F1EA" strokeWidth="1" />
          <path d="M40 340 H230" stroke="#F4F1EA" strokeWidth="1" />
          <path d="M370 300 L580 232" stroke="#FF4A2E" strokeWidth="1" />
          <path d="M378 348 H580" stroke="#FF7757" strokeWidth="1" />
          <path d="M370 396 L580 464" stroke="#9DB4FF" strokeWidth="1" />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-transparent to-ink-950/40" />

        <figure className="absolute bottom-14 left-12 right-12">
          <blockquote className="display text-[1.65rem] leading-[1.25] text-cream/90">
            “{quote.line}”
          </blockquote>
          <figcaption className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-cream/45">
            {quote.who}
          </figcaption>
        </figure>
      </aside>
    </div>
  );
}
