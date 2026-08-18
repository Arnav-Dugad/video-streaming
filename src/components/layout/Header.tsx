'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import {
  Bookmark, Clock, Command, Compass, Flame, LogOut, Menu, Search, Settings,
  Sparkles, TvMinimalPlay, User as UserIcon, X, Users,
} from 'lucide-react';

import { Logo } from './Logo';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';
import { useUI } from '@/lib/store';
import { usePreferences } from '@/hooks/usePreferences';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Header.

   Transparent over the home hero and opaque everywhere else, crossing over on
   scroll. It hides on downward scroll past 240px and returns immediately on
   any upward scroll — the pattern people already know from reading apps, which
   buys back ~64px of vertical space on a dense grid without ever feeling lost.
   ========================================================================== */

const NAV = [
  { href: '/browse', label: 'Browse', icon: Compass },
  { href: '/trending', label: 'Trending', icon: Flame },
  { href: '/collections', label: 'Collections', icon: Sparkles },
  { href: '/rooms', label: 'Rooms', icon: Users },
] as const;

/** The chart is region-scoped, so the nav link carries the viewer's own region
 *  rather than silently defaulting everyone to the US one. Keeping it in the
 *  URL means the page stays cacheable and the link stays shareable. */
function navHref(href: string, region: string): string {
  return href === '/trending' && region && region !== 'US'
    ? `/trending?region=${region}`
    : href;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const openPalette = useUI((s) => s.openPalette);
  const prefs = usePreferences();
  const navOpen = useUI((s) => s.navOpen);
  const setNavOpen = useUI((s) => s.setNavOpen);

  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastY = useRef(0);

  const overHero = pathname === '/' && !scrolled;

  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > 24);
    const goingDown = y > lastY.current;
    // Ignore rubber-banding at the very top.
    if (y > 240 && goingDown && !navOpen && !menuOpen) setHidden(true);
    else if (!goingDown || y < 120) setHidden(false);
    lastY.current = y;
  });

  // Close both menus whenever the route changes. This is genuine
  // synchronisation to an external value (the router), not derived state:
  // navigation can originate from a link inside the menu, from the command
  // palette, or from the browser's own back button.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNavOpen(false); setMenuOpen(false); }, [pathname, setNavOpen]);

  return (
    <>
      <motion.header
        animate={{ y: hidden ? '-105%' : '0%' }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'fixed inset-x-0 top-0 z-[60] transition-[background-color,box-shadow,backdrop-filter] duration-500',
          overHero ? 'bg-transparent' : 'chrome hairline-b',
        )}
      >
        <div className="gutter-wide flex h-16 items-center gap-3 sm:h-[68px]">
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-cream-dim transition-colors hover:bg-cream/10 hover:text-cream lg:hidden"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
          >
            {navOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
          </button>

          <Logo className="shrink-0" />

          <nav className="ml-6 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={navHref(item.href, prefs.region)}
                  className={cn(
                    'relative rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-300',
                    active ? 'text-cream' : 'text-muted hover:text-cream-dim',
                  )}
                >
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-x-3 -bottom-px h-px bg-flare"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {/* The search field is a button — everything routes through ⌘K, so
                there is exactly one search surface to learn. */}
            <button
              onClick={openPalette}
              className={cn(
                'group flex h-9 items-center gap-2.5 rounded-xl border border-line pl-3 pr-2 text-left',
                'transition-[border-color,background-color,width] duration-300',
                'hover:border-line-strong hover:bg-cream/[0.03]',
                'w-9 justify-center sm:w-56 sm:justify-start xl:w-72',
              )}
              aria-label="Search"
            >
              <Search className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-cream-dim" />
              <span className="hidden flex-1 truncate text-[13px] text-faint sm:block">
                Search everything
              </span>
              <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint sm:flex">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="block rounded-full transition-transform duration-300 hover:scale-105 active:scale-95"
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                >
                  <Avatar src={profile?.photoURL ?? user.photoURL} name={profile?.displayName ?? user.displayName} size={34} />
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute right-0 top-12 z-20 w-60 origin-top-right overflow-hidden rounded-2xl border border-line-strong chrome shadow-float"
                      >
                        <div className="border-b border-line px-4 py-3.5">
                          <p className="truncate text-[13.5px] font-medium text-cream">
                            {profile?.displayName ?? 'Viewer'}
                          </p>
                          <p className="truncate font-mono text-[11px] text-faint">
                            @{profile?.handle ?? user.uid.slice(0, 8)}
                          </p>
                        </div>
                        <div className="p-1.5">
                          <MenuLink href="/library" icon={Bookmark}>Library</MenuLink>
                          <MenuLink href="/library?tab=history" icon={Clock}>History</MenuLink>
                          <MenuLink href="/rooms" icon={TvMinimalPlay}>Watch parties</MenuLink>
                          <MenuLink href="/profile" icon={Settings}>Settings</MenuLink>
                        </div>
                        <div className="border-t border-line p-1.5">
                          <button
                            onClick={async () => { await signOut(); router.push('/'); }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-cream-dim transition-colors hover:bg-cream/[0.06] hover:text-cream"
                          >
                            <LogOut className="h-4 w-4" /> Sign out
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="hidden rounded-lg px-3 py-2 text-[13.5px] font-medium text-cream-dim transition-colors hover:text-cream sm:block"
                >
                  Sign in
                </Link>
                <ButtonLink href="/signup" size="sm" className="rounded-xl">
                  <UserIcon className="h-3.5 w-3.5" />
                  Create account
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </motion.header>

      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} pathname={pathname} signedIn={Boolean(user)} />
    </>
  );
}

function MenuLink({ href, icon: Icon, children }: { href: string; icon: typeof Bookmark; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-cream-dim transition-colors hover:bg-cream/[0.06] hover:text-cream"
    >
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}

function MobileNav({
  open, onClose, pathname, signedIn,
}: { open: boolean; onClose(): void; pathname: string; signedIn: boolean }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const links = [
    ...NAV,
    ...(signedIn
      ? ([{ href: '/library', label: 'Library', icon: Bookmark }, { href: '/profile', label: 'Settings', icon: Settings }] as const)
      : ([{ href: '/signin', label: 'Sign in', icon: UserIcon }] as const)),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[55] bg-ink-950/70 backdrop-blur-sm lg:hidden"
          />
          <motion.nav
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed inset-y-0 left-0 z-[58] w-[min(20rem,82vw)] border-r border-line bg-ink-900 pt-[68px] lg:hidden"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col p-3">
              {links.map((item, i) => {
                const active = pathname.startsWith(item.href);
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 + i * 0.045, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] transition-colors',
                        active ? 'bg-cream/[0.07] text-cream' : 'text-muted hover:bg-cream/[0.04] hover:text-cream-dim',
                      )}
                    >
                      <item.icon className={cn('h-[18px] w-[18px]', active && 'text-flare')} />
                      {item.label}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}

export { IconButton };
