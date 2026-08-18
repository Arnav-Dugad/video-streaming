/* React's <ViewTransition> ships in the canary build the App Router runs on,
   but @types/react has no declaration for it yet — the runtime export exists
   (verified: next/dist/compiled/react exports it as a symbol), the types do
   not. This declares just enough of it to use safely.

   Delete this file once @types/react declares ViewTransition itself. */

import type { ExoticComponent, ReactNode } from 'react';

declare module 'react' {
  interface ViewTransitionProps {
    children?: ReactNode;
    /** Pairs an element on the old page with one on the new page. */
    name?: string;
    /** Animation class applied when a named pair is found. */
    share?: 'auto' | 'none' | string;
    /** Applied when the element is entering. */
    enter?: 'auto' | 'none' | string;
    /** Applied when the element is leaving. */
    exit?: 'auto' | 'none' | string;
    /** Applied when the element is updating in place. */
    update?: 'auto' | 'none' | string;
    /** 'none' stops this element animating during unrelated transitions. */
    default?: 'auto' | 'none' | string;
  }

  export const ViewTransition: ExoticComponent<ViewTransitionProps>;
}
