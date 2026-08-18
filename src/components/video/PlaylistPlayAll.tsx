'use client';

import { useRouter } from 'next/navigation';
import { Play, Shuffle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { usePlayer } from '@/lib/store';
import type { Video } from '@/lib/types';

/** Loads a whole playlist into the player queue, so autoplay walks it in
 *  order instead of falling back to derived related videos. */
export function PlaylistPlayAll({ videos }: { videos: Video[] }) {
  const router = useRouter();
  const load = usePlayer((s) => s.load);

  if (videos.length === 0) return null;

  const start = (list: Video[]) => {
    const [first, ...rest] = list;
    load(first, { queue: rest });
    router.push(`/watch?v=${first.id}`);
  };

  const shuffle = () => {
    // Fisher–Yates on a copy; sorting by Math.random() is biased.
    const copy = [...videos];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    start(copy);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => start(videos)} size="md">
        <Play className="h-4 w-4 fill-current" /> Play all
      </Button>
      <Button onClick={shuffle} variant="outline" size="md">
        <Shuffle className="h-4 w-4" /> Shuffle
      </Button>
    </div>
  );
}
