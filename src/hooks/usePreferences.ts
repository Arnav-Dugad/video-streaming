'use client';

import { useMemo } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { DEFAULT_PREFERENCES } from '@/lib/db';
import type { Preferences } from '@/lib/types';

/** Preferences for the current viewer, falling back to defaults when signed
 *  out or still loading. Components should never branch on the profile being
 *  null just to read a setting. */
export function usePreferences(): Preferences {
  const { profile } = useAuth();
  return useMemo(
    () => ({ ...DEFAULT_PREFERENCES, ...(profile?.preferences ?? {}) }),
    [profile],
  );
}

/** Search parameters implied by the viewer's content preferences. Shared by
 *  every client-side search so the palette, the For You rail and Load More all
 *  behave the same way. */
export function useSearchDefaults(): Record<string, string> {
  const prefs = usePreferences();
  return useMemo(() => {
    const out: Record<string, string> = {};
    if (prefs.region) out.region = prefs.region;
    if (prefs.language) out.lang = prefs.language;
    if (prefs.safeSearch !== 'moderate') out.safe = prefs.safeSearch;
    return out;
  }, [prefs.region, prefs.language, prefs.safeSearch]);
}
