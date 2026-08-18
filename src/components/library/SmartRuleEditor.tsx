'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { DEFAULT_SMART_RULE, type Subscription } from '@/lib/db';
import type { SmartRule } from '@/lib/types';

/* ==========================================================================
   The rule editor.

   Channels are picked from the viewer's own follow list rather than typed as
   ids — nobody knows a channel id, and a free-text channel field would need a
   search-per-keystroke that costs 100 quota units a time.
   ========================================================================== */

const LENGTHS = [
  { label: 'Any length', min: undefined, max: undefined },
  { label: 'Under 10 min', min: undefined, max: 600 },
  { label: '10–30 min', min: 600, max: 1800 },
  { label: 'Over 30 min', min: 1800, max: undefined },
];

const WINDOWS = [
  { label: 'Any time', days: undefined },
  { label: 'Past week', days: 7 },
  { label: 'Past month', days: 30 },
  { label: 'Past year', days: 365 },
];

const ORDERS = [
  { value: 'date' as const, label: 'Newest first' },
  { value: 'viewCount' as const, label: 'Most viewed' },
];

export function SmartRuleEditor({
  title, rule, following, onTitle, onRule,
}: {
  title: string;
  rule: SmartRule;
  following: Subscription[];
  onTitle(v: string): void;
  onRule(r: SmartRule): void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleChannel = (sub: Subscription) => {
    const has = rule.channelIds.includes(sub.channelId);
    onRule({
      ...rule,
      channelIds: has
        ? rule.channelIds.filter((id) => id !== sub.channelId)
        : [...rule.channelIds, sub.channelId].slice(0, 10),
      channelNames: has
        ? rule.channelNames.filter((n) => n !== sub.channelTitle)
        : [...rule.channelNames, sub.channelTitle].slice(0, 10),
    });
  };

  const activeLength = LENGTHS.find((l) => l.min === rule.minSeconds && l.max === rule.maxSeconds) ?? LENGTHS[0];
  const activeWindow = WINDOWS.find((w) => w.days === rule.publishedWithinDays) ?? WINDOWS[0];

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Name</span>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={60}
          placeholder="Short tech, this week"
          className="h-11 w-full max-w-sm rounded-xl border border-line bg-ink-850 px-3.5 text-[14px] text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
        />
      </label>

      {/* ------------------------------ channels ------------------------- */}
      <div>
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          From these channels
        </p>
        <p className="mb-3 max-w-md text-[12px] leading-relaxed text-muted">
          Pick up to ten from the channels you follow. Leave empty to search
          everything instead.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {rule.channelIds.map((id, i) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-flare/40 bg-flare/10 py-1 pl-2 pr-1 text-[12px] text-flare"
            >
              {rule.channelNames[i] ?? 'Channel'}
              <button
                onClick={() => onRule({
                  ...rule,
                  channelIds: rule.channelIds.filter((c) => c !== id),
                  channelNames: rule.channelNames.filter((_, n) => n !== i),
                })}
                aria-label={`Remove ${rule.channelNames[i] ?? 'channel'}`}
                className="grid h-5 w-5 place-items-center rounded transition-colors hover:bg-flare/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {rule.channelIds.length < 10 && (
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] text-cream-dim transition-colors hover:border-line-strong hover:text-cream"
            >
              <Plus className="h-3 w-3" /> Add channel
            </button>
          )}
        </div>

        {pickerOpen && (
          <div className="mt-3 max-h-56 max-w-md overflow-y-auto rounded-xl border border-line p-1.5">
            {following.length === 0 && (
              <p className="px-2.5 py-3 text-[12.5px] text-faint">
                You are not following any channels yet. Follow a few and they appear here.
              </p>
            )}
            {following.map((sub) => {
              const on = rule.channelIds.includes(sub.channelId);
              return (
                <button
                  key={sub.channelId}
                  onClick={() => toggleChannel(sub)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    on ? 'bg-flare/10 text-flare' : 'text-cream-dim hover:bg-cream/[0.06] hover:text-cream',
                  )}
                >
                  <Avatar src={sub.avatar} name={sub.channelTitle} size={24} />
                  <span className="flex-1 truncate text-[13px]">{sub.channelTitle}</span>
                  {on && <span className="font-mono text-[10px]">added</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------ filters -------------------------- */}
      <label className="block">
        <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Containing (optional)
        </span>
        <input
          value={rule.query ?? ''}
          onChange={(e) => onRule({ ...rule, query: e.target.value })}
          maxLength={120}
          placeholder={rule.channelIds.length > 0 ? 'Narrows within those channels' : 'Searches everything'}
          className="h-11 w-full max-w-sm rounded-xl border border-line bg-ink-850 px-3.5 text-[14px] text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
        />
      </label>

      <Row label="Length">
        {LENGTHS.map((l) => (
          <Chip
            key={l.label}
            on={l === activeLength}
            onClick={() => onRule({ ...rule, minSeconds: l.min, maxSeconds: l.max })}
          >
            {l.label}
          </Chip>
        ))}
      </Row>

      <Row label="Published">
        {WINDOWS.map((w) => (
          <Chip
            key={w.label}
            on={w === activeWindow}
            onClick={() => onRule({ ...rule, publishedWithinDays: w.days })}
          >
            {w.label}
          </Chip>
        ))}
      </Row>

      <Row label="Order">
        {ORDERS.map((o) => (
          <Chip key={o.value} on={rule.order === o.value} onClick={() => onRule({ ...rule, order: o.value })}>
            {o.label}
          </Chip>
        ))}
      </Row>

      <Row label="Skip">
        <Chip
          on={Boolean(rule.excludeWatched)}
          onClick={() => onRule({ ...rule, excludeWatched: !rule.excludeWatched })}
        >
          Things I have already watched
        </Chip>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-[12px] transition-[background-color,border-color,color] duration-250',
        on ? 'border-flare/45 bg-flare/12 text-flare' : 'border-line text-cream-dim hover:border-line-strong hover:text-cream',
      )}
    >
      {children}
    </button>
  );
}

export { DEFAULT_SMART_RULE };
