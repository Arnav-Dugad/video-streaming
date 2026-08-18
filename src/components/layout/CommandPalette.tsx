'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, Bookmark, Clock, Compass, CornerDownLeft, Flame, Loader2,
  Search, Settings, Sparkles, TrendingUp, Users, X,
} from 'lucide-react';

import { useUI, usePlayer } from '@/lib/store';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useDebounced } from '@/hooks/useDebounced';
import { useSearchDefaults } from '@/hooks/usePreferences';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { formatDuration, viewLabel } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Video } from '@/lib/types';

/* ==========================================================================
   Command palette.

   One surface for search *and* navigation, the way an editor's palette works.
   Notes on the interaction model:

     · Results are keyboard-first: ↑↓ move, ↵ opens, ⌥↵ opens full search.
     · Suggestions and video results race independently — whichever resolves
       first renders, so the list never blocks on the slower of the two.
     · An in-flight request is aborted the moment the query changes, so a slow
       response can never overwrite a newer one.
   ========================================================================== */

type Row =
  | { kind: 'search'; value: string }
  | { kind: 'recent'; value: string }
  | { kind: 'suggestion'; value: string }
  | { kind: 'video'; value: Video }
  | { kind: 'action'; value: Action };

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run(): void;
  group: string;
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const close = useUI((s) => s.closePalette);
  const toggle = useUI((s) => s.togglePalette);
  const hydrateSearches = useUI((s) => s.hydrateSearches);

  useEffect(() => { hydrateSearches(); }, [hydrateSearches]);

  useKeyboard(
    [
      { key: 'k', meta: true, whileTyping: true, run: toggle },
      { key: '/', run: () => useUI.getState().openPalette() },
    ],
    true,
  );

  // Mounting the dialog only while open means its query, cursor and results
  // reset naturally on unmount — no effect has to clear them, and there is no
  // frame where the previous session's results flash on reopen.
  return (
    <AnimatePresence>
      {open && <PaletteDialog onClose={close} />}
    </AnimatePresence>
  );
}

interface Results { q: string; videos: Video[]; suggestions: string[] }

/** Stable empty references so memo dependencies don't churn. */
const EMPTY_VIDEOS: Video[] = [];
const EMPTY_STRINGS: string[] = [];

function PaletteDialog({ onClose }: { onClose(): void }) {
  const router = useRouter();
  const recent = useUI((s) => s.recentSearches);
  const pushSearch = useUI((s) => s.pushSearch);
  const clearSearches = useUI((s) => s.clearSearches);
  const closePlayer = usePlayer((s) => s.close);
  const hasVideo = usePlayer((s) => Boolean(s.video));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ q: '', videos: [], suggestions: [] });
  const [cursorState, setCursorState] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const debounced = useDebounced(query, 220);
  const searchDefaults = useSearchDefaults();

  const close = onClose;

  useKeyboard([{ key: 'escape', whileTyping: true, run: close }], true);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, []);

  /* ------------------------------ search -------------------------------- */

  const term = debounced.trim();
  const searchable = term.length >= 2;

  useEffect(() => {
    abort.current?.abort();
    if (!searchable) return;

    const controller = new AbortController();
    abort.current = controller;

    // Both requests write into the same keyed record, so a slow response for
    // an older term can never overwrite a newer one.
    fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { suggestions?: string[] }) =>
        setResults((prev) => ({ ...prev, q: term, suggestions: d.suggestions ?? [] })))
      .catch(() => { /* aborted or unavailable */ });

    const qs = new URLSearchParams({ q: term, limit: '6', ...searchDefaults });
    fetch(`/api/search?${qs}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { items?: Video[] }) =>
        setResults((prev) => ({ q: term, suggestions: prev.q === term ? prev.suggestions : [], videos: d.items ?? [] })))
      .catch(() => { /* aborted or unavailable */ });

    return () => controller.abort();
  }, [term, searchable, searchDefaults]);

  // Only ever show results that belong to the term currently on screen.
  // Memoised because these feed a useMemo below — a fresh [] each render would
  // rebuild the whole row list on every keystroke.
  const fresh = results.q === term;
  const visible = useMemo(
    () => (searchable && fresh
      ? { videos: results.videos, suggestions: results.suggestions }
      : { videos: EMPTY_VIDEOS, suggestions: EMPTY_STRINGS }),
    [searchable, fresh, results.videos, results.suggestions],
  );
  const { videos, suggestions } = visible;
  const loading = searchable && !fresh;

  /* ------------------------------ actions ------------------------------- */

  const go = useCallback((href: string) => { close(); router.push(href); }, [close, router]);

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    pushSearch(trimmed);
    go(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [go, pushSearch]);

  const navActions = useMemo<Action[]>(() => {
    const base: Action[] = [
      { id: 'browse', label: 'Browse', hint: 'Discover by category', icon: Compass, group: 'Go to', run: () => go('/browse') },
      { id: 'trending', label: 'Trending', hint: 'What the world is watching', icon: Flame, group: 'Go to', run: () => go('/trending') },
      { id: 'collections', label: 'Collections', hint: 'Hand-built runs', icon: Sparkles, group: 'Go to', run: () => go('/collections') },
      { id: 'rooms', label: 'Watch parties', hint: 'Watch together in sync', icon: Users, group: 'Go to', run: () => go('/rooms') },
      { id: 'library', label: 'Library', hint: 'Saved, liked, playlists', icon: Bookmark, group: 'Go to', run: () => go('/library') },
      { id: 'history', label: 'History', icon: Clock, group: 'Go to', run: () => go('/library?tab=history') },
      { id: 'settings', label: 'Settings', icon: Settings, group: 'Go to', run: () => go('/profile') },
    ];
    if (hasVideo) {
      base.push({
        id: 'close-player', label: 'Close the player', icon: X, group: 'Playback',
        run: () => { closePlayer(); close(); },
      });
    }
    return base;
  }, [go, hasVideo, closePlayer, close]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navActions;
    return navActions.filter((a) => a.label.toLowerCase().includes(q) || a.hint?.toLowerCase().includes(q));
  }, [navActions, query]);

  /* ------------------------- flattened list ----------------------------- */

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const q = query.trim();
    if (q) out.push({ kind: 'search', value: q });
    if (!q) for (const r of recent) out.push({ kind: 'recent', value: r });
    for (const sug of suggestions.slice(0, 4)) {
      if (sug.toLowerCase() !== q.toLowerCase()) out.push({ kind: 'suggestion', value: sug });
    }
    for (const v of videos) out.push({ kind: 'video', value: v });
    for (const a of filteredActions) out.push({ kind: 'action', value: a });
    return out;
  }, [query, recent, suggestions, videos, filteredActions]);

  // Clamp rather than reset in an effect: the list shrinks as you type, and a
  // cursor past the end would silently activate the wrong row on Enter.
  const cursor = rows.length === 0 ? 0 : Math.min(cursorState, rows.length - 1);

  const activate = useCallback((row: Row | undefined) => {
    if (!row) return;
    switch (row.kind) {
      case 'search':
      case 'recent':
      case 'suggestion':
        runSearch(row.value);
        break;
      case 'video':
        pushSearch(query.trim());
        go(`/watch?v=${row.value.id}`);
        break;
      case 'action':
        row.value.run();
        break;
    }
  }, [go, pushSearch, query, runSearch]);

  const move = useCallback((delta: number) => {
    setCursorState((c) => {
      const from = rows.length === 0 ? 0 : Math.min(c, rows.length - 1);
      const next = (from + delta + rows.length) % Math.max(rows.length, 1);
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector(`[data-row="${next}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      });
      return next;
    });
  }, [rows.length]);

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[8vh] sm:pt-[12vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-ink-950/75 backdrop-blur-md"
          onClick={close}
        />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Search and commands"
          initial={{ opacity: 0, y: -18, scale: 0.975 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.985 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-ink-900/95 shadow-float backdrop-blur-2xl"
        >
          <div className="flex items-center gap-3 border-b border-line px-4">
            {loading
              ? <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-flare" />
              : <Search className="h-[18px] w-[18px] shrink-0 text-muted" />}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCursorState(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.altKey) runSearch(query);
                  else activate(rows[cursor]);
                }
                if (e.key === 'Tab' && rows[cursor]?.kind === 'suggestion') {
                  e.preventDefault();
                  setQuery(rows[cursor].value as string);
                }
              }}
              placeholder="Search videos, channels, or jump to a page…"
              className="h-14 flex-1 bg-transparent text-[15px] text-cream outline-none placeholder:text-faint"
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-controls="palette-results"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint transition-colors hover:text-cream"
                aria-label="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="hidden shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint sm:block">
              esc
            </kbd>
          </div>

          <div ref={listRef} id="palette-results" role="listbox" className="max-h-[min(28rem,58vh)] overflow-y-auto overscroll-contain p-2">
            {rows.length === 0 && (
              <p className="px-3 py-10 text-center text-[13px] text-faint">
                {query.length === 1 ? 'Keep typing…' : 'Nothing matched. Try a different phrase.'}
              </p>
            )}

            {rows.map((row, i) => (
              <Row
                key={`${row.kind}-${i}`}
                row={row}
                index={i}
                active={i === cursor}
                onHover={() => setCursorState(i)}
                onSelect={() => activate(row)}
                prevKind={rows[i - 1]?.kind}
              />
            ))}

            {!query && recent.length > 0 && (
              <button
                onClick={clearSearches}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-faint transition-colors hover:text-muted"
              >
                Clear recent searches
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 font-mono text-[10.5px] text-faint">
            <Legend keys="↑↓">navigate</Legend>
            <Legend keys="↵">open</Legend>
            <Legend keys="⌥↵">full search</Legend>
            <span className="ml-auto hidden sm:inline">PRISM</span>
          </div>
      </motion.div>
    </div>
  );
}

/* -------------------------------- rows ---------------------------------- */

const GROUP_LABEL: Record<string, string> = {
  search: 'Search',
  recent: 'Recent',
  suggestion: 'Suggestions',
  video: 'Videos',
  action: 'Go to',
};

function Row({
  row, index, active, onHover, onSelect, prevKind,
}: {
  row: { kind: string; value: unknown };
  index: number;
  active: boolean;
  onHover(): void;
  onSelect(): void;
  prevKind?: string;
}) {
  const showHeading = row.kind !== prevKind && row.kind !== 'search';

  return (
    <>
      {showHeading && (
        <p className="eyebrow px-3 pb-1.5 pt-3 first:pt-1">{GROUP_LABEL[row.kind]}</p>
      )}
      <button
        data-row={index}
        role="option"
        aria-selected={active}
        onMouseMove={onHover}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150',
          active ? 'bg-cream/[0.08]' : 'hover:bg-cream/[0.04]',
        )}
      >
        {renderRow(row)}
        {active && <CornerDownLeft className="ml-auto h-3.5 w-3.5 shrink-0 text-faint" />}
      </button>
    </>
  );
}

function renderRow(row: { kind: string; value: unknown }) {
  switch (row.kind) {
    case 'search':
      return (
        <>
          <Search className="h-4 w-4 shrink-0 text-flare" />
          <span className="truncate text-[13.5px] text-cream">
            Search for <span className="font-medium">“{row.value as string}”</span>
          </span>
        </>
      );
    case 'recent':
      return (
        <>
          <Clock className="h-4 w-4 shrink-0 text-muted" />
          <span className="truncate text-[13.5px] text-cream-dim">{row.value as string}</span>
        </>
      );
    case 'suggestion':
      return (
        <>
          <TrendingUp className="h-4 w-4 shrink-0 text-muted" />
          <span className="truncate text-[13.5px] text-cream-dim">{row.value as string}</span>
        </>
      );
    case 'video': {
      const v = row.value as Video;
      return (
        <>
          <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-ink-800">
            <Thumbnail src={v.thumbnail} alt="" sizes="80px" reveal={false} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] text-cream">{v.title}</span>
            <span className="block truncate font-mono text-[11px] text-faint tnum">
              {v.channelTitle} · {viewLabel(v.viewCount)}
              {v.durationSeconds ? ` · ${formatDuration(v.durationSeconds)}` : ''}
            </span>
          </span>
        </>
      );
    }
    case 'action': {
      const a = row.value as Action;
      return (
        <>
          <a.icon className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] text-cream">{a.label}</span>
            {a.hint && <span className="block truncate text-[11.5px] text-faint">{a.hint}</span>}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint" />
        </>
      );
    }
    default:
      return null;
  }
}

function Legend({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded border border-line px-1 py-px">{keys}</kbd>
      {children}
    </span>
  );
}
