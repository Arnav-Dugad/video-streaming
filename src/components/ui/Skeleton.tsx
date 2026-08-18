import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

/** Matches VideoCard's geometry exactly so nothing shifts when data lands. */
export function VideoCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-video w-full rounded-card" />
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-[64%]" />
          <Skeleton className="h-3 w-[44%]" />
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => <VideoCardSkeleton key={i} />)}
    </div>
  );
}

export function RailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[clamp(15rem,26vw,20rem)] shrink-0 space-y-3">
          <Skeleton className="aspect-video w-full rounded-card" />
          <Skeleton className="h-3.5 w-[88%]" />
          <Skeleton className="h-3 w-[52%]" />
        </div>
      ))}
    </div>
  );
}
