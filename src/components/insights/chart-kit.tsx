'use client';

import { useId, useState, type ReactNode } from 'react';
import { Table2 } from 'lucide-react';

import { cn } from '@/lib/cn';

/* ==========================================================================
   Chart primitives.

   PRISM carries one signal colour, so every chart here is single-hue: bar
   length and cell darkness do the encoding, and colour never has to separate
   identities. That sidesteps the whole categorical/CVD problem rather than
   solving it — there is nothing to tell apart by hue.

   The ramp below was validated with the dataviz validator against this
   surface (#0e0e12) as an ordinal ramp: monotone lightness, adjacent ΔL ≥
   0.06, single hue, and the quiet end still clearing the 2:1 floor.
   ========================================================================== */

/** Sequential, quiet → loud. */
export const RAMP = ['#8A3724', '#AC4429', '#CD522F', '#EC6339', '#FF8F70'] as const;

/** Single-series mark colour: 5.8:1 on the chart surface. */
export const MARK = '#EE6038';

/** A cell with no data. Deliberately near-surface — "nothing happened" should
 *  not compete with the smallest real value. */
export const EMPTY = '#1B1B22';

export const SURFACE = '#0e0e12';

/* ------------------------------- card ---------------------------------- */

interface CardProps {
  title: string;
  /** One line saying what the reader is looking at. */
  caption?: string;
  children: ReactNode;
  /** The WCAG-clean twin. Every chart ships one. */
  table: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function ChartCard({ title, caption, children, table, action, className }: CardProps) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();

  return (
    <section
      className={cn('rounded-2xl border border-line bg-ink-850/60 p-5 sm:p-6', className)}
      aria-labelledby={`${id}-title`}
    >
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[14.5px] font-medium text-cream">{title}</h2>
          {caption && <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">{caption}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          <button
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            title={showTable ? 'Show the chart' : 'Show the numbers'}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg border text-cream-dim transition-colors',
              showTable ? 'border-flare/40 bg-flare/10 text-flare' : 'border-line hover:border-line-strong hover:text-cream',
            )}
          >
            <Table2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {showTable ? <div className="overflow-x-auto">{table}</div> : children}
    </section>
  );
}

/* ------------------------------- table ---------------------------------- */

export function DataTable({
  head, rows,
}: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full min-w-[20rem] border-collapse text-left">
      <thead>
        <tr className="border-b border-line">
          {head.map((h, i) => (
            <th
              key={h}
              scope="col"
              className={cn(
                'pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted',
                i > 0 && 'text-right',
              )}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b border-line/60 last:border-0">
            {row.map((cell, c) => (
              <td
                key={c}
                className={cn(
                  'py-2 text-[12.5px]',
                  c === 0 ? 'text-cream' : 'text-right font-mono text-cream-dim tnum',
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------ stat tile -------------------------------- */

export function StatTile({
  label, value, hint,
}: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-850/60 p-5">
      <p className="eyebrow">{label}</p>
      {/* Proportional figures and the UI sans, not the display serif — equal-width
          digits make a large standalone number read loose, and a serif on a hero
          figure reads as decoration rather than data. */}
      <p className="mt-2.5 text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-none tracking-[-0.02em] text-cream">
        {value}
      </p>
      {hint && <p className="mt-2 text-[12px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/* ------------------------------- legend ---------------------------------- */

/** Sequential scales need a key; bar charts of one series do not. */
export function RampLegend({ lowLabel, highLabel }: { lowLabel: string; highLabel: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-faint">
      <span>{lowLabel}</span>
      <span className="flex gap-[2px]" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: EMPTY }} />
        {RAMP.map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
        ))}
      </span>
      <span>{highLabel}</span>
    </div>
  );
}

/** Five buckets over the ramp. Zero is never bucket 1 — "nothing" gets its
 *  own colour so the smallest real value is still visibly present. */
export function rampStep(value: number, max: number): string {
  if (value <= 0 || max <= 0) return EMPTY;
  const ratio = value / max;
  const index = Math.min(RAMP.length - 1, Math.floor(ratio * RAMP.length));
  return RAMP[index];
}
