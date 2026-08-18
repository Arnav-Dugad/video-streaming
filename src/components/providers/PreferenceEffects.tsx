'use client';

import { useEffect } from 'react';

import { usePreferences } from '@/hooks/usePreferences';
import { usePlayer } from '@/lib/store';

/* ==========================================================================
   Applies the preferences that live outside React's tree.

   The film grain is a body class rather than a conditional element because it
   is drawn by a ::after pseudo-element on <body>; the player settings are
   pushed into the store so the player, which is mounted once at the root,
   picks them up without every consumer having to read the profile itself.
   ========================================================================== */

export function PreferenceEffects() {
  const prefs = usePreferences();

  const setHighRes = usePlayer((s) => s.setHighRes);
  const setAmbient = usePlayer((s) => s.setAmbient);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const setQuality = usePlayer((s) => s.setQuality);

  useEffect(() => {
    document.body.classList.toggle('grain', prefs.filmGrain && !prefs.reduceMotion);
  }, [prefs.filmGrain, prefs.reduceMotion]);

  useEffect(() => {
    // Reduce-motion also kills the drifting glow, which is the whole point of
    // the effect — leaving it static would just be a coloured haze.
    setAmbient(prefs.ambientGlow && !prefs.reduceMotion);
  }, [prefs.ambientGlow, prefs.reduceMotion, setAmbient]);

  useEffect(() => { setHighRes(prefs.highRes); }, [prefs.highRes, setHighRes]);
  useEffect(() => { setPlaybackRate(prefs.defaultSpeed); }, [prefs.defaultSpeed, setPlaybackRate]);

  useEffect(() => {
    // Preserve whatever the player last reported it is actually serving —
    // this sets the *preference*, not a claim about the current rendition.
    setQuality(prefs.defaultQuality, usePlayer.getState().actualQuality);
  }, [prefs.defaultQuality, setQuality]);

  return null;
}
