import { TriangleAlert } from 'lucide-react';

/** Shown whenever the app is serving its seeded catalogue instead of live API
 *  data. Being explicit about this is not optional — seeded view counts
 *  presented as real ones would be a lie in the product surface. */
export function DemoBanner() {
  return (
    <div className="gutter-wide pt-4">
      <div className="flex items-start gap-3 rounded-xl border border-flare/25 bg-flare/[0.07] px-4 py-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-flare" />
        <p className="text-[12.5px] leading-relaxed text-cream-dim">
          <span className="font-medium text-cream">Seeded catalogue.</span>{' '}
          No <code className="font-mono text-[11.5px] text-flare">YOUTUBE_API_KEY</code> is
          configured, so PRISM is serving a fixed set of real videos with placeholder
          statistics. Playback, search and every feature work — add a key to
          switch to live data.
        </p>
      </div>
    </div>
  );
}
