'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Send } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { Comment } from '@/lib/types';

/* ==========================================================================
   Posting a real YouTube comment.

   Only rendered once a YouTube account is connected, because that is the only
   way this can work — commenting requires the viewer's own Google
   authorisation, not the deployment's API key. Signing in to PRISM is not
   enough, and showing a box that cannot submit would be worse than showing
   nothing.
   ========================================================================== */

const MAX = 2000;

interface Connection {
  configured: boolean;
  connected: boolean;
  channel?: { title: string; avatar: string } | null;
}

const ERRORS: Record<string, string> = {
  comments_disabled: 'The owner has turned comments off for this video.',
  not_connected: 'Your YouTube connection expired. Reconnect it in settings.',
  too_long: 'That is longer than YouTube allows.',
  empty: 'Write something first.',
};

export function CommentComposer({
  videoId, onPosted,
}: { videoId: string; onPosted(comment: Comment): void }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/youtube/me')
      .then((r) => r.json())
      .then((d: Connection) => alive && setConnection(d))
      .catch(() => alive && setConnection({ configured: false, connected: false }));
    return () => { alive = false; };
  }, []);

  // Nothing to offer until an account is connected — and nothing to explain
  // either, if the deployment has no OAuth credentials at all.
  if (!connection?.configured) return null;

  if (!connection.connected) {
    return (
      <p className="rounded-xl border border-line px-4 py-3 text-[12.5px] leading-relaxed text-muted">
        <Link href="/profile" className="font-medium text-cream underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-cream">
          Connect a YouTube account
        </Link>{' '}
        to reply here. Commenting needs your own Google authorisation — signing
        in to PRISM is not enough, and never could be.
      </p>
    );
  }

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const res = await fetch('/api/youtube/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, text: body }),
      });
      const data = (await res.json()) as { comment?: Comment; error?: string };

      if (!res.ok || !data.comment) {
        toast(ERRORS[data.error ?? ''] ?? 'Could not post that comment', { tone: 'error' });
        return;
      }

      // Show it immediately rather than waiting for it to appear in the API's
      // own listing, which lags behind by minutes.
      onPosted(data.comment);
      setText('');
      toast('Comment posted to YouTube', { tone: 'success' });
    } catch {
      toast('Could not post that comment', { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const remaining = MAX - text.length;

  return (
    <div className="flex gap-3">
      <Avatar src={connection.channel?.avatar} name={connection.channel?.title} size={34} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
          rows={focused || text ? 3 : 1}
          placeholder={`Comment on YouTube as ${connection.channel?.title ?? 'yourself'}…`}
          className={cn(
            'w-full resize-none rounded-xl border border-line bg-ink-850 px-3.5 py-2.5',
            'text-[13.5px] leading-relaxed text-cream outline-none transition-[border-color,height]',
            'placeholder:text-faint focus:border-flare/60',
          )}
        />

        <AnimatePresence>
          {(focused || text) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center justify-between gap-3 overflow-hidden pt-2"
            >
              <span className={cn('font-mono text-[10.5px] tnum', remaining < 100 ? 'text-flare' : 'text-faint')}>
                {remaining < 200 ? `${remaining} left` : 'Posts publicly to YouTube'}
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => { setText(''); setFocused(false); }}
                  className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:text-cream"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!text.trim() || sending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-cream px-3 text-[12.5px] font-medium text-ink-950 transition-[background-color,opacity] hover:bg-white disabled:opacity-30"
                >
                  {sending
                    ? <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                    : <Send className="h-3.5 w-3.5" />}
                  Comment
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
