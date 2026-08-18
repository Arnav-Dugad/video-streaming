import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { PrismMark } from '@/components/layout/Logo';

export default function NotFound() {
  return (
    <div className="grid min-h-[70svh] place-items-center px-6">
      <div className="max-w-md text-center">
        <PrismMark className="mx-auto h-9 w-9 text-cream/40" />
        <p className="eyebrow mt-8">Error 404</p>
        <h1 className="display mt-4 text-[clamp(2.2rem,6vw,3.4rem)] text-cream">
          The light went somewhere else.
        </h1>
        <p className="mt-5 text-[14px] leading-relaxed text-muted">
          That page does not exist — the video may have been removed, or the link
          was mistyped somewhere along the way.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/" size="md">Back to home</ButtonLink>
          <ButtonLink href="/trending" variant="outline" size="md">See what is trending</ButtonLink>
        </div>
        <p className="mt-8 font-mono text-[11px] text-faint">
          Or press <kbd className="rounded border border-line px-1.5 py-0.5">⌘K</kbd> to search
        </p>
        <Link href="/browse" className="sr-only">Browse</Link>
      </div>
    </div>
  );
}
