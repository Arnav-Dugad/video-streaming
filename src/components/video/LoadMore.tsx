'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { VideoCard } from './VideoCard';
import { Button } from '@/components/ui/Button';
import type { Video } from '@/lib/types';

/* ==========================================================================
   Progressive result loading.

   Auto-loads the next page when the sentinel comes into view, but stops
   auto-loading after three pages and switches to an explicit button. Endless
   infinite scroll makes the footer unreachable and burns API quota on results
   nobody asked for.
   ========================================================================== */

const AUTO_PAGES = 3;

interface Props {
  initialToken?: string;
  /** Query params for /api/search, minus pageToken. */
  params: Record<string, string>;
}

export function LoadMore({ initialToken, params }: Props) {
  const [items, setItems] = useState<Video[]>([]);
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async () => {
    if (!token || loading) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...params, pageToken: token });
      const res = await fetch(`/api/search?${qs}`);
      const data = (await res.json()) as { items?: Video[]; nextPageToken?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setItems((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...(data.items ?? []).filter((v) => !seen.has(v.id))];
      });
      setToken(data.nextPageToken);
      setPages((p) => p + 1);
    } catch (err) {
      setError((err as Error).message || 'Could not load more results.');
    } finally {
      setLoading(false);
    }
  }, [token, loading, params]);

  useEffect(() => {
    if (pages >= AUTO_PAGES || !token || !sentinel.current) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchPage(); },
      { rootMargin: '600px' },
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [fetchPage, pages, token]);

  return (
    <>
      {items.length > 0 && (
        <div className="mt-9 grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((v) => <VideoCard key={v.id} video={v} />)}
        </div>
      )}

      <div ref={sentinel} className="h-px" aria-hidden />

      <div className="flex flex-col items-center gap-3 py-10">
        {loading && (
          <span className="flex items-center gap-2 font-mono text-[11.5px] text-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more
          </span>
        )}
        {error && <p className="text-[12.5px] text-flare">{error}</p>}
        {!loading && token && pages >= AUTO_PAGES && (
          <Button onClick={fetchPage} variant="outline" size="md">Load more results</Button>
        )}
        {!token && items.length > 0 && (
          <p className="font-mono text-[11px] text-faint">That is everything.</p>
        )}
      </div>
    </>
  );
}
