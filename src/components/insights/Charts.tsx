'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';

import { ChartCard, DataTable, MARK, RampLegend, rampStep } from './chart-kit';
import { humanDuration, hourLabel, type ChannelStat, type DayCell } from '@/lib/insights';
import { cn } from '@/lib/cn';

/* ==========================================================================
   The four charts. All single-series, so none carries a legend box except the
   heatmap, whose sequential scale genuinely needs a key.
   ========================================================================== */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ------------------------------ heatmap ---------------------------------- */

export function ActivityHeatmap({ days }: { days: DayCell[] }) {
  const [hovered, setHovered] = useState<DayCell | null>(null);
  const max = Math.max(...days.map((d) => d.seconds), 1);

  // Columns are weeks. Pad the front so every column starts on a Monday,
  // otherwise the weekday rows do not line up with their labels.
  const first = new Date(`${days[0].date}T00:00:00`);
  const lead = (first.getDay() + 6) % 7;
  const cells: (DayCell | null)[] = [...Array(lead).fill(null), ...days];
  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <ChartCard
      title="When you watch"
      caption={`Each square is a day over the last ${Math.round(days.length / 7)} weeks. Darker means more time.`}
      action={<RampLegend lowLabel="none" highLabel="most" />}
      table={
        <DataTable
          head={['Day', 'Time', 'Videos']}
          rows={days.filter((d) => d.seconds > 0).reverse().map((d) => [d.date, humanDuration(d.seconds), d.videos])}
        />
      }
    >
      <div className="relative [--cell:14px] sm:[--cell:16px] lg:[--cell:18px]">
        <div className="no-scrollbar flex gap-[4px] overflow-x-auto pb-1">
          {/* Weekday rail. Alternate labels only — all seven collide at 9px.
              Identical cell height and gap to the columns beside it, so the
              labels sit on the rows they name. */}
          <div className="mr-1.5 flex shrink-0 flex-col gap-[4px]">
            {WEEKDAYS.map((d, i) => (
              <span
                key={d}
                className="flex h-[var(--cell)] w-7 items-center font-mono text-[9px] leading-none text-faint"
              >
                {i % 2 === 1 ? d : ''}
              </span>
            ))}
          </div>

          {weeks.map((week, w) => (
            <div key={w} className="flex shrink-0 flex-col gap-[4px]">
              {week.map((cell, d) => (
                <motion.span
                  key={cell?.date ?? `pad-${w}-${d}`}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, delay: Math.min(w * 0.008 + d * 0.004, 0.5), ease: [0.16, 1, 0.3, 1] }}
                  onMouseEnter={() => cell && setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  // Hit area is the square plus its 3px gutter, so a 12px cell
                  // does not demand pixel-perfect aim.
                  className={cn('block h-[var(--cell)] w-[var(--cell)] rounded-[3px]', cell && 'cursor-default')}
                  style={{ background: cell ? rampStep(cell.seconds, max) : 'transparent' }}
                  tabIndex={cell && cell.seconds > 0 ? 0 : -1}
                  onFocus={() => cell && setHovered(cell)}
                  onBlur={() => setHovered(null)}
                  aria-label={cell ? `${cell.date}: ${humanDuration(cell.seconds)}` : undefined}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Reserved height so the card does not jump as the tooltip appears. */}
        <p className="mt-3 h-4 font-mono text-[11px] text-cream-dim tnum">
          {hovered
            ? `${hovered.date} · ${humanDuration(hovered.seconds)} · ${hovered.videos} ${hovered.videos === 1 ? 'video' : 'videos'}`
            : ''}
        </p>
      </div>
    </ChartCard>
  );
}

/* --------------------------- top channels -------------------------------- */

export function TopChannels({ channels }: { channels: ChannelStat[] }) {
  const top = channels.slice(0, 8);
  const max = Math.max(...top.map((c) => c.seconds), 1);

  return (
    <ChartCard
      title="Where the time goes"
      caption="Your eight most-watched channels, by time reached."
      table={
        <DataTable
          head={['Channel', 'Time', 'Videos', 'Finished']}
          rows={channels.map((c) => [c.channel, humanDuration(c.seconds), c.videos, c.finished])}
        />
      }
    >
      <ul className="space-y-3.5">
        {top.map((c, i) => (
          <li key={c.channelId || c.channel}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <Link
                href={c.channelId ? `/channel/${c.channelId}` : '#'}
                className="truncate text-[13px] text-cream transition-colors hover:text-white"
              >
                {c.channel}
              </Link>
              {/* Direct-labelled: eight rows is few enough that the value beside
                  each bar reads cleanly and no axis is needed. */}
              <span className="shrink-0 font-mono text-[11.5px] text-cream-dim tnum">
                {humanDuration(c.seconds)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(c.seconds / max) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                // Square at the baseline, rounded at the data end.
                className="h-full rounded-r-[4px]"
                style={{ background: MARK }}
              />
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/* ---------------------------- hour of day -------------------------------- */

export function HourHistogram({ hours, peakHour }: { hours: number[]; peakHour: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...hours, 1);

  return (
    <ChartCard
      title="Your hours"
      caption="Which hours of the day you actually watch in. Local time."
      table={
        <DataTable
          head={['Hour', 'Time']}
          rows={hours.map((s, h) => [hourLabel(h), humanDuration(s)]).filter((_, h) => hours[h] > 0)}
        />
      }
    >
      <div>
        <div className="relative flex h-32 items-end gap-[2px]">
          {/* One solid hairline baseline. Drawing a stub under each empty hour
              instead produced a row of 1px dashes separated by the 2px gap,
              which reads as a dashed axis rule — noise pretending to be data. */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-line" aria-hidden />
          {hours.map((seconds, hour) => {
            const isPeak = hour === peakHour && seconds > 0;
            return (
              <div
                key={hour}
                className="group relative flex h-full flex-1 items-end"
                onMouseEnter={() => setHovered(hour)}
                onMouseLeave={() => setHovered(null)}
              >
                <motion.div
                  initial={{ height: 0 }}
                  whileInView={{ height: `${Math.max((seconds / max) * 100, seconds > 0 ? 3 : 0)}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: hour * 0.015, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full rounded-t-[4px]"
                  style={{
                    background: MARK,
                    // The peak is the point of the chart; everything else is
                    // context, so it steps back rather than competing.
                    opacity: seconds === 0 ? 0 : isPeak ? 1 : 0.45,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Positioned over the bars they name rather than spread evenly —
            five labels across 24 slots do not land on the right hours. */}
        <div className="relative mt-2 h-3.5">
          {[0, 6, 12, 18].map((h) => (
            <span
              key={h}
              className="absolute font-mono text-[9.5px] text-faint"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {hourLabel(h)}
            </span>
          ))}
          <span className="absolute right-0 font-mono text-[9.5px] text-faint">11pm</span>
        </div>

        <p className="mt-3 h-4 font-mono text-[11px] text-cream-dim tnum">
          {hovered !== null && hours[hovered] > 0
            ? `${hourLabel(hovered)} · ${humanDuration(hours[hovered])}`
            : `Busiest around ${hourLabel(peakHour)}`}
        </p>
      </div>
    </ChartCard>
  );
}

/* ---------------------------- length split ------------------------------- */

export function LengthSplit({ lengths }: { lengths: { label: string; seconds: number; videos: number }[] }) {
  const total = lengths.reduce((s, l) => s + l.seconds, 0) || 1;
  // Ordinal, not nominal: short → long has a real order, so it takes the
  // one-hue ramp rather than three unrelated colours.
  const steps = ['#8A3724', '#CD522F', '#FF8F70'];

  return (
    <ChartCard
      title="Short or long"
      caption="How your watching splits across video lengths."
      table={
        <DataTable
          head={['Length', 'Time', 'Videos']}
          rows={lengths.map((l) => [l.label, humanDuration(l.seconds), l.videos])}
        />
      }
    >
      <div>
        {/* 2px surface gaps between segments, never borders. */}
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
          {lengths.map((l, i) => (
            <motion.div
              key={l.label}
              initial={{ flexGrow: 0 }}
              whileInView={{ flexGrow: Math.max(l.seconds / total, 0.02) }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-[3px]"
              style={{ background: steps[i] ?? steps[steps.length - 1], flexBasis: 0 }}
            />
          ))}
        </div>

        <ul className="mt-4 space-y-2">
          {lengths.map((l, i) => (
            <li key={l.label} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: steps[i] ?? steps[steps.length - 1] }}
                aria-hidden
              />
              <span className="flex-1 truncate text-[12.5px] text-cream-dim">{l.label}</span>
              <span className="shrink-0 font-mono text-[11.5px] text-cream-dim tnum">
                {Math.round((l.seconds / total) * 100)}%
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-faint tnum">
                {humanDuration(l.seconds)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
