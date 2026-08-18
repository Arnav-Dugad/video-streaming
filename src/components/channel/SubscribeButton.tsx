'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';
import { isSubscribed, toggleSubscription } from '@/lib/db';
import { toast } from '@/lib/store';

export function SubscribeButton({
  channel,
}: { channel: { id: string; title: string; avatar: string } }) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState({ following: false, ready: false });

  useEffect(() => {
    if (!user) return;
    let alive = true;
    isSubscribed(user.uid, channel.id)
      .then((v) => alive && setState({ following: v, ready: true }))
      .catch(() => alive && setState({ following: false, ready: true }));
    return () => { alive = false; };
  }, [user, channel.id]);

  // Signed-out users need no lookup, so they are never in a loading state.
  const following = user ? state.following : false;
  const ready = user ? state.ready : true;
  const setFollowing = (v: boolean | ((p: boolean) => boolean)) =>
    setState((s) => ({ ...s, following: typeof v === 'function' ? v(s.following) : v }));

  const toggle = async () => {
    if (!user) {
      toast('Sign in to follow channels', { action: { label: 'Sign in', run: () => router.push('/signin') } });
      return;
    }
    setFollowing((v) => !v);
    try { setFollowing(await toggleSubscription(user.uid, channel)); }
    catch { setFollowing((v) => !v); toast('Could not update that', { tone: 'error' }); }
  };

  return (
    <Button
      onClick={toggle}
      variant={following ? 'secondary' : 'primary'}
      size="md"
      className="rounded-full px-5"
      loading={!ready && Boolean(user)}
    >
      {following ? <><Check className="h-4 w-4" /> Following</> : <><Bell className="h-4 w-4" /> Follow</>}
    </Button>
  );
}
