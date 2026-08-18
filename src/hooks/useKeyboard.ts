'use client';

import { useEffect } from 'react';

/** True when focus is somewhere that swallows single-key shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

export interface Binding {
  /** `event.key`, lower-cased. */
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Allow the binding to fire while an input has focus. */
  whileTyping?: boolean;
  run(event: KeyboardEvent): void;
}

export function useKeyboard(bindings: Binding[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const typing = isTypingTarget(event.target);

      for (const b of bindings) {
        if (b.key !== key) continue;
        if (typing && !b.whileTyping) continue;
        // Treat ⌘ and Ctrl as the same modifier.
        const meta = event.metaKey || event.ctrlKey;
        if (Boolean(b.meta) !== meta) continue;
        if (Boolean(b.shift) !== event.shiftKey) continue;
        if (Boolean(b.alt) !== event.altKey) continue;
        event.preventDefault();
        b.run(event);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings, enabled]);
}
