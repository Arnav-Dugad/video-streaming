'use client';

import { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { VideoCard } from './VideoCard';
import { cn } from '@/lib/cn';
import type { Video } from '@/lib/types';
import type { HistoryEntry } from '@/lib/types';

interface Props {
  videos: Video[];
  className?: string;
  /** videoId -> seconds watched. Drives the resume bar. */
  progress?: Record<string, number>;
  layout?: 'grid' | 'list';
  emptyState?: React.ReactNode;
  priorityCount?: number;
}

export function VideoGrid({ videos, className, progress, layout = 'grid', emptyState, priorityCount = 4 }: Props) {
  if (videos.length === 0 && emptyState) return <>{emptyState}</>;

  if (layout === 'list') {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} layout="row" progress={progress?.[v.id]} />
        ))}
      </div>
    );
  }

  return (
    <Stagger
      className={cn(
        'grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
        className,
      )}
    >
      {videos.map((v, i) => (
        <StaggerItem key={v.id}>
          <VideoCard video={v} progress={progress?.[v.id]} priority={i < priorityCount} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export function progressMap(history: HistoryEntry[]): Record<string, number> {
  return Object.fromEntries(history.map((h) => [h.videoId, h.progress]));
}
