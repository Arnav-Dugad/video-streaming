'use client';

import { useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

/* ==========================================================================
   Who you are in a watch party.

   Separate from the name on the rest of the account on purpose. The name your
   playlists are published under and the name three friends call you on a
   Friday night are not always the same thing, and having to rename your whole
   profile to fix the second is the kind of small indignity people notice.

   One place resolves it so every surface that writes a name into a room —
   joining, chat, the queue, reactions, hosting — agrees. Falling back through
   the profile to the auth record means a signed-in viewer always has a name,
   even before their profile document has loaded.
   ========================================================================== */

export interface RoomIdentity {
  name: string;
  photo: string | null;
}

export function useRoomIdentity(): RoomIdentity {
  const { user, profile } = useAuth();

  return useMemo(() => ({
    name:
      profile?.roomName?.trim() ||
      profile?.displayName?.trim() ||
      user?.displayName?.trim() ||
      'Viewer',
    photo: profile?.photoURL ?? user?.photoURL ?? null,
  }), [profile?.roomName, profile?.displayName, profile?.photoURL, user?.displayName, user?.photoURL]);
}
