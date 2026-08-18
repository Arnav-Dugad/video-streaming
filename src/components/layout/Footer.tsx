import Link from 'next/link';
import { PrismMark } from './Logo';

const COLUMNS = [
  {
    heading: 'Watch',
    links: [
      { href: '/browse', label: 'Browse' },
      { href: '/trending', label: 'Trending' },
      { href: '/collections', label: 'Collections' },
      { href: '/rooms', label: 'Watch parties' },
    ],
  },
  {
    heading: 'Yours',
    links: [
      { href: '/library', label: 'Library' },
      { href: '/library?tab=history', label: 'History' },
      { href: '/library?tab=playlists', label: 'Playlists' },
      { href: '/profile', label: 'Settings' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/signin', label: 'Sign in' },
      { href: '/signup', label: 'Create account' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-28 border-t border-line">
      <div className="gutter-wide py-14">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <PrismMark className="h-6 w-6 text-cream" />
              <span className="text-[15px] font-semibold uppercase tracking-[0.22em] text-cream">Prism</span>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              A viewing surface for the open web&apos;s video library. Built on the
              YouTube Data API — every video, channel and creator belongs to its
              original owner.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="eyebrow mb-4">{col.heading}</h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-cream-dim transition-colors duration-300 hover:text-cream"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-faint">
            © {new Date().getFullYear()} PRISM · An independent client. Not affiliated with YouTube or Google.
          </p>
          <p className="font-mono text-[11px] text-faint">
            Press <kbd className="rounded border border-line px-1 py-px">⌘K</kbd> anywhere
          </p>
        </div>
      </div>
    </footer>
  );
}
