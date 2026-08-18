'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Send, Clock3 } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { sendRoomMessage, watchRoomMessages } from '@/lib/db';
import { formatDuration, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RoomMessage } from '@/lib/types';
import type { User } from 'firebase/auth';

/** Chat with timestamp pinning: every message records the second of the video
 *  it was sent at, so a reaction stays attached to the moment that caused it
 *  even when someone scrolls back through the log an hour later. */
export function RoomChat({
  roomId, user, currentSecond,
}: { roomId: string; user: User; currentSecond: number }) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => watchRoomMessages(roomId, setMessages), [roomId]);

  // Only auto-scroll if the reader is already at the bottom — yanking someone
  // away from what they were reading is the classic chat-widget sin.
  useEffect(() => {
    if (pinned.current) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      await sendRoomMessage(roomId, {
        uid: user.uid,
        name: user.displayName ?? 'Viewer',
        photo: user.photoURL,
        text: body.slice(0, 500),
        atSecond: Math.floor(currentSecond),
      });
    } catch {
      setText(body); // restore so nothing is lost
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-line">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="eyebrow">Room chat</p>
        <span className="font-mono text-[10.5px] text-faint tnum">{messages.length}</span>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 && (
          <p className="py-10 text-center text-[12.5px] text-faint">
            Nothing said yet. Reactions are pinned to the second you send them.
          </p>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const mine = m.uid === user.uid;
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="flex gap-2.5"
              >
                <Avatar src={m.photo} name={m.name} size={26} className="mt-0.5" ring={mine} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn('text-[12.5px] font-medium', mine ? 'text-flare' : 'text-cream')}>
                      {mine ? 'You' : m.name}
                    </span>
                    {m.atSecond !== undefined && (
                      <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-faint tnum">
                        <Clock3 className="h-2.5 w-2.5" />{formatDuration(m.atSecond)}
                      </span>
                    )}
                    <span className="font-mono text-[9.5px] text-faint">{timeAgo(m.at)}</span>
                  </p>
                  <p className="mt-0.5 break-words text-[13px] leading-snug text-cream-dim">{m.text}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottom} />
      </div>

      <div className="border-t border-line p-2.5">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={`Say something at ${formatDuration(currentSecond)}…`}
            maxLength={500}
            className="h-10 flex-1 rounded-xl border border-line bg-ink-850 px-3.5 text-[13px] text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cream text-ink-950 transition-[background-color,opacity] hover:bg-white disabled:opacity-30"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
