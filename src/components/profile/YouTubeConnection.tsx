'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ExternalLink, Loader2, Unplug } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { compactNumber } from '@/lib/format';
import { toast } from '@/lib/store';

/* ==========================================================================
   Connect a YouTube account.

   Opt-in, and separate from signing in to PRISM. The scopes this asks for are
   classed as sensitive by Google, which means an unverified project shows an
   "unverified app" interstitial and is capped at 100 users — so making it part
   of sign-up would put a scary screen in front of everyone for a feature most
   people will not use.
   ========================================================================== */

interface Connection {
  configured: boolean;
  connected: boolean;
  channel?: { id: string; title: string; avatar: string; subscriberCount: number } | null;
}

/** Callback outcomes, as plain language. */
const OUTCOMES: Record<string, { message: string; tone: 'success' | 'error' | 'neutral' }> = {
  connected: { message: 'YouTube account connected', tone: 'success' },
  cancelled: { message: 'Connection cancelled', tone: 'neutral' },
  invalid: { message: 'That sign-in link had expired — try again', tone: 'error' },
  failed: { message: 'Could not connect to YouTube', tone: 'error' },
};

export function YouTubeConnection() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/youtube/me')
      .then((r) => r.json())
      .then((d: Connection) => setState(d))
      .catch(() => setState({ configured: false, connected: false }));
  }, []);

  useEffect(() => { load(); }, [load]);

  // The callback redirects back with ?youtube=<outcome>; report it once and
  // strip it so a refresh does not repeat the toast.
  useEffect(() => {
    const outcome = params.get('youtube');
    if (!outcome) return;
    const result = OUTCOMES[outcome];
    if (result) toast(result.message, { tone: result.tone });
    router.replace('/profile', { scroll: false });
    load();
  }, [params, router, load]);

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch('/api/youtube/disconnect', { method: 'POST' });
      setState({ configured: true, connected: false });
      toast('YouTube account disconnected', { tone: 'success' });
    } catch {
      toast('Could not disconnect', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    return <div className="flex items-center gap-2 text-[13px] text-faint"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</div>;
  }

  if (!state.configured) {
    return (
      <p className="max-w-lg rounded-xl border border-line px-4 py-3 text-[13px] leading-relaxed text-muted">
        This deployment has no YouTube OAuth credentials, so connecting an account
        is switched off. Everything else — browsing, playback, your PRISM library
        — works without it.
      </p>
    );
  }

  if (!state.connected) {
    return (
      <div className="max-w-lg">
        <Button
          onClick={() => {
            setBusy(true);
            // A full-page navigation is required: this route answers with a
            // 302 to Google's consent screen, and router.push would try to
            // fetch it as an RSC payload and fail.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = '/api/youtube/connect';
          }}
          loading={busy}
          size="md"
        >
          <ExternalLink className="h-4 w-4" /> Connect YouTube
        </Button>
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Grants PRISM permission to read your real subscriptions, subscribe on
          your behalf, and post comments as you. Google will warn that this app
          is unverified — that is expected for a project that has not gone
          through their review, and you can revoke access at any time from your
          Google account.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 rounded-xl border border-mint/25 bg-mint/[0.06] px-4 py-3">
        <Avatar src={state.channel?.avatar} name={state.channel?.title} size={36} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-cream">
            <Check className="h-3.5 w-3.5 shrink-0 text-mint" />
            {state.channel?.title || 'Connected'}
          </p>
          {state.channel?.subscriberCount ? (
            <p className="font-mono text-[11px] text-faint tnum">
              {compactNumber(state.channel.subscriberCount)} subscribers
            </p>
          ) : null}
        </div>
        <button
          onClick={disconnect}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:text-flare disabled:opacity-50"
        >
          <Unplug className="h-3.5 w-3.5" /> Disconnect
        </button>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-faint">
        You can now comment and subscribe on YouTube directly from PRISM.
        Disconnecting revokes the token immediately.
      </p>
    </div>
  );
}
