'use client';

import { motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/* ==========================================================================
   Page transition.

   A short cross-fade with a 6px rise, keyed on pathname. Deliberately fast
   (340ms) and enter-only: exit animations on route change require holding the
   old tree in memory, which delays the new page's first paint. A crisp entry
   reads as more responsive than a symmetrical transition.
   ========================================================================== */

export function PageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.main
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-[70vh] pt-16 sm:pt-[68px]"
      id="main"
    >
      {children}
    </motion.main>
  );
}
