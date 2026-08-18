import Link from 'next/link';
import { cn } from '@/lib/cn';

/** The mark: a beam entering a triangular prism and leaving as three rays.
 *  Drawn, not imported, so it scales and inherits colour anywhere. */
export function PrismMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-6 w-6', className)} fill="none" aria-hidden>
      <path d="M16 5.5 27 25.5H5L16 5.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 15h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20.5 13.5 30.5 10" stroke="#FF4A2E" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21.5 16h9" stroke="#FF7757" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20.5 18.5 30.5 22" stroke="#9DB4FF" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/"
      className={cn('group flex items-center gap-2.5 select-none', className)}
      aria-label="PRISM — home"
    >
      <PrismMark className="h-[26px] w-[26px] text-cream transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-[8deg]" />
      {!compact && (
        <span className="text-[17px] font-semibold uppercase leading-none tracking-[0.22em] text-cream">
          Prism
        </span>
      )}
    </Link>
  );
}
