'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpDown, MessageSquare, ThumbsUp } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { compactNumber, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Comment } from '@/lib/types';

/** Read-only. Posting a comment requires an OAuth-authorised YouTube account,
 *  which is a different consent model from signing in to PRISM — so the UI
 *  says so plainly instead of showing a box that cannot work. */
export function Comments({ comments, total }: { comments: Comment[]; total?: number }) {
  const [order, setOrder] = useState<'top' | 'new'>('top');
  const [expanded, setExpanded] = useState(false);

  const sorted = [...comments].sort((a, b) =>
    order === 'top'
      ? b.likeCount - a.likeCount
      : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const visible = expanded ? sorted : sorted.slice(0, 8);

  if (comments.length === 0) {
    return (
      <section className="rounded-2xl border border-line px-5 py-10 text-center">
        <MessageSquare className="mx-auto h-5 w-5 text-faint" />
        <p className="mt-3 text-[13px] text-muted">Comments are turned off for this video.</p>
      </section>
    );
  }

  return (
    <section aria-label="Comments">
      <header className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-medium text-cream">
          {compactNumber(total ?? comments.length)} comments
        </h2>
        <button
          onClick={() => setOrder((o) => (o === 'top' ? 'new' : 'top'))}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-cream/[0.05] hover:text-cream"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {order === 'top' ? 'Top first' : 'Newest first'}
        </button>
      </header>

      <ul className="space-y-5">
        {visible.map((c, i) => (
          <motion.li
            key={c.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: Math.min(i, 6) * 0.035, ease: [0.16, 1, 0.3, 1] }}
            className="flex gap-3"
          >
            <Avatar src={c.authorAvatar} name={c.author} size={34} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium text-cream">{c.author}</span>
                <span className="font-mono text-[10.5px] text-faint">{timeAgo(c.publishedAt)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-[1.6] text-cream-dim">{c.text}</p>
              <p className="mt-2 flex items-center gap-4 font-mono text-[11px] text-faint tnum">
                <span className="inline-flex items-center gap-1.5">
                  <ThumbsUp className="h-3 w-3" /> {compactNumber(c.likeCount)}
                </span>
                {c.replyCount > 0 && (
                  <span>{c.replyCount} {c.replyCount === 1 ? 'reply' : 'replies'}</span>
                )}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>

      {sorted.length > 8 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'mt-6 w-full rounded-xl border border-line py-2.5 text-[13px] text-cream-dim',
            'transition-[background-color,border-color,color] duration-300',
            'hover:border-line-strong hover:bg-cream/[0.03] hover:text-cream',
          )}
        >
          {expanded ? 'Show fewer comments' : `Show all ${sorted.length} loaded comments`}
        </button>
      )}

      <p className="mt-5 text-center text-[11.5px] text-faint">
        Comments are read from YouTube. Replying needs a YouTube account connected directly.
      </p>
    </section>
  );
}
