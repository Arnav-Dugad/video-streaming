'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, X } from 'lucide-react';

import { dismissInvite, watchInvites, type RoomInvite } from '@/lib/db';
import { Thumbnail } from '@/components/ui/Thumbnail';
import { timeAgo } from '@/lib/format';

/** Invitations waiting for you. Live, because the whole point of being invited
 *  to a watch party is that it is happening now. */
export function RoomInvites({ uid }: { uid: string }) {
  const [invites, setInvites] = useState<RoomInvite[]>([]);

  useEffect(() => watchInvites(uid, setInvites), [uid]);

  if (invites.length === 0) return null;

  return (
    <section className="gutter-wide pb-10">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[15px] font-medium text-cream">Invitations</h2>
        <span className="font-mono text-[11px] text-flare tnum">{invites.length}</span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {invites.map((invite) => (
            <motion.li
              key={invite.roomId}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="group relative"
            >
              <Link
                href={`/rooms/${invite.roomId}`}
                data-cursor="Join"
                className="flex items-center gap-3 rounded-2xl border border-flare/30 bg-flare/[0.04] p-3 transition-[border-color,background-color] duration-300 hover:border-flare/60 hover:bg-flare/[0.08]"
              >
                <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                  <Thumbnail src={invite.videoThumbnail} alt="" sizes="96px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-flare">{invite.fromName} invited you</p>
                  <h3 className="clamp-2 mt-0.5 text-[13px] font-medium leading-snug text-cream">
                    {invite.videoTitle}
                  </h3>
                  <p className="mt-1 font-mono text-[10.5px] text-faint">{timeAgo(invite.at)}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>

              <button
                onClick={() => dismissInvite(uid, invite.roomId).catch(() => {})}
                aria-label="Dismiss invitation"
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-line bg-ink-900 text-muted opacity-0 transition-[opacity,color,transform] duration-200 hover:text-flare focus-visible:opacity-100 active:scale-90 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
