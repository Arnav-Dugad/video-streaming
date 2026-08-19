'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AtSign, Check, Copy, Loader2, Send, UserMinus, UserPlus, Users } from 'lucide-react';

import { addFriend, findByHandle, inviteToRoom, listFriends, removeFriend } from '@/lib/db';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Friend, HandleEntry, Room, UserProfile } from '@/lib/types';

/* ==========================================================================
   Friends.

   Deliberately handle-based rather than email-based. A handle is something
   you can say out loud, put in a bio or read off a screen; an email address
   is a thing people are right to be careful with. The directory behind it
   holds four fields and nothing else — see firestore.rules.

   With a `room` prop, each row grows an invite button that drops a card into
   that friend's own subtree. There is no shared inbox collection, so nobody
   can enumerate anyone's invitations.
   ========================================================================== */

interface Props {
  profile: UserProfile;
  /** When present, friends can be invited straight into this room. */
  room?: Room;
  className?: string;
}

export function FriendsPanel({ profile, room, className }: Props) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [query, setQuery] = useState('');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<HandleEntry | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);

  const reload = useCallback(() => {
    listFriends(profile.uid).then(setFriends).catch(() => setFriends([]));
  }, [profile.uid]);

  useEffect(reload, [reload]);

  const look = async () => {
    const clean = query.trim().replace(/^@/, '');
    if (!clean) return;
    setLooking(true);
    setFound(undefined);
    try {
      const entry = await findByHandle(clean);
      setFound(entry);
    } catch {
      toast('Could not search right now', { tone: 'error' });
      setFound(null);
    } finally {
      setLooking(false);
    }
  };

  const add = async (entry: HandleEntry) => {
    try {
      await addFriend(profile, entry);
      toast(`${entry.displayName} added`);
      setQuery('');
      setFound(undefined);
      reload();
    } catch (err) {
      toast((err as Error).message || 'Could not add that person', { tone: 'error' });
    }
  };

  const drop = async (friend: Friend) => {
    // Optimistic: the row disappearing is the whole feedback.
    setFriends((prev) => prev?.filter((f) => f.uid !== friend.uid) ?? null);
    try {
      await removeFriend(profile.uid, friend.uid);
    } catch {
      toast('Could not remove them', { tone: 'error' });
      reload();
    }
  };

  const invite = async (friend: Friend) => {
    if (!room) return;
    setInvited((prev) => [...prev, friend.uid]);
    try {
      await inviteToRoom(friend.uid, {
        roomId: room.id,
        code: room.code,
        title: room.title,
        videoTitle: room.videoTitle,
        videoThumbnail: room.videoThumbnail,
        fromUid: profile.uid,
        fromName: profile.displayName,
      });
      toast(`Invited ${friend.displayName}`);
    } catch {
      setInvited((prev) => prev.filter((id) => id !== friend.uid));
      toast('Could not send that invite', { tone: 'error' });
    }
  };

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(`@${profile.handle}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast('Could not copy your handle', { tone: 'error' }); }
  };

  const already = new Set(friends?.map((f) => f.uid) ?? []);

  return (
    <div className={cn('rounded-2xl border border-line p-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-cream">Friends</h2>
        {friends && <span className="font-mono text-[11px] text-faint tnum">{friends.length}</span>}
      </div>

      {/* Your own handle first: people cannot add you until they know it. */}
      <button
        onClick={copyHandle}
        className="mt-3 flex w-full items-center gap-2 rounded-xl border border-line bg-ink-850 px-3 py-2.5 text-left transition-[border-color,background-color] hover:border-line-strong hover:bg-cream/[0.04]"
      >
        <AtSign className="h-3.5 w-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-cream">{profile.handle}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {copied ? 'Copied' : 'Your handle'}
        </span>
        {copied
          ? <Check className="h-3.5 w-3.5 shrink-0 text-mint" />
          : <Copy className="h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>

      {/* ------------------------------ add ------------------------------- */}
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFound(undefined); }}
            onKeyDown={(e) => e.key === 'Enter' && look()}
            placeholder="their handle"
            aria-label="Find someone by handle"
            className="h-10 w-full rounded-xl border border-line bg-ink-850 pl-8 pr-3 text-[13.5px] text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
          />
        </div>
        <Button onClick={look} loading={looking} variant="outline" size="sm" className="shrink-0">
          Find
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {found === null && (
          <motion.p
            key="miss"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden text-[12px] text-faint"
          >
            Nobody is using that handle.
          </motion.p>
        )}
        {found && (
          <motion.div
            key={found.uid}
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 flex items-center gap-2.5 rounded-xl border border-flare/30 bg-flare/[0.05] p-2.5"
          >
            <Avatar src={found.photoURL} name={found.displayName} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-cream">{found.displayName}</p>
              <p className="truncate font-mono text-[11px] text-faint">@{found.handle}</p>
            </div>
            {found.uid === profile.uid ? (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">That’s you</span>
            ) : already.has(found.uid) ? (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-mint">Added</span>
            ) : (
              <Button onClick={() => add(found)} size="sm" className="shrink-0">
                <UserPlus className="h-3.5 w-3.5" /> Add
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------------------- list ------------------------------- */}
      <div className="mt-4">
        {friends === null && (
          <div className="grid place-items-center py-8"><Loader2 className="h-4 w-4 animate-spin text-flare" /></div>
        )}

        {friends?.length === 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-line px-3.5 py-4">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
            <p className="text-[12.5px] leading-relaxed text-muted">
              Nobody yet. Share your handle above, or type someone else’s to add them —
              then invite them into a room in one tap.
            </p>
          </div>
        )}

        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {friends?.map((f) => (
              <motion.li
                key={f.uid}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8, height: 0, marginTop: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-cream/[0.04]"
              >
                <Avatar src={f.photoURL} name={f.displayName} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-cream-dim">{f.displayName}</p>
                  <p className="truncate font-mono text-[11px] text-faint">@{f.handle}</p>
                </div>

                {room && (
                  <button
                    onClick={() => invite(f)}
                    disabled={invited.includes(f.uid)}
                    aria-label={`Invite ${f.displayName}`}
                    title={invited.includes(f.uid) ? 'Invited' : 'Invite to this room'}
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-[background-color,color,transform] duration-200',
                      invited.includes(f.uid)
                        ? 'text-mint'
                        : 'text-muted hover:bg-cream/10 hover:text-cream active:scale-90',
                    )}
                  >
                    {invited.includes(f.uid) ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  </button>
                )}

                <button
                  onClick={() => drop(f)}
                  aria-label={`Remove ${f.displayName}`}
                  title="Remove"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted opacity-0 transition-[opacity,background-color,color,transform] duration-200 hover:bg-flare/15 hover:text-flare focus-visible:opacity-100 active:scale-90 group-hover:opacity-100"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
