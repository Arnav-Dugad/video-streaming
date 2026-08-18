import { GridSkeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="gutter-wide py-16">
      <div className="mb-10 space-y-4">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-12 w-[min(28rem,80%)] rounded-lg" />
      </div>
      <GridSkeleton count={8} />
    </div>
  );
}
