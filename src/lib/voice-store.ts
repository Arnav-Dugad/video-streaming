'use client';

import { create } from 'zustand';

/* ==========================================================================
   The one thing voice needs to tell the rest of the room.

   Kept out of the player and out of the rail, because both need it and
   neither owns it: the rail knows who is talking, and the player is what has
   to get quieter about it.
   ========================================================================== */

interface VoiceUiState {
  /** This viewer has voice switched on. */
  active: boolean;
  /** Somebody other than this viewer is talking right now. */
  someoneSpeaking: boolean;
  setActive(active: boolean): void;
  setSomeoneSpeaking(speaking: boolean): void;
}

export const useVoiceUi = create<VoiceUiState>((set) => ({
  active: false,
  someoneSpeaking: false,
  // Leaving voice must also clear the speaking flag, or the video stays
  // ducked forever against a room nobody is talking in.
  setActive: (active) => set((s) => ({ active, someoneSpeaking: active ? s.someoneSpeaking : false })),
  setSomeoneSpeaking: (someoneSpeaking) => set({ someoneSpeaking }),
}));

/** How far the video drops while somebody is talking. Far enough to hear over,
 *  not so far that the film stops. */
export const DUCK_FACTOR = 0.25;
