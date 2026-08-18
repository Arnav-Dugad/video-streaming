'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Check, Keyboard, Loader2, LogOut, Sparkles } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { updateProfile } from '@/lib/db';
import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast, useUI, usePlayer } from '@/lib/store';
import { qualityLabel } from '@/lib/player-modules';
import { YouTubeConnection } from './YouTubeConnection';
import type { UserProfile } from '@/lib/types';

/** Offered up front rather than read from the player, since this page is not
 *  necessarily showing one. The player's own menu lists exactly what the
 *  current video publishes. */
const QUALITY_CHOICES = ['auto', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small'];

const INTERESTS = [
  'Music', 'Technology', 'Science', 'Film', 'Gaming', 'Cooking', 'Design',
  'History', 'Sport', 'Travel', 'Comedy', 'Business', 'Art', 'Fitness',
];

export function ProfileClient() {
  const { user, profile, loading, configured } = useAuth();

  if (loading) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-flare" /></div>;
  }

  if (!configured) {
    return (
      <>
        <PageHeader eyebrow="Account" title="Settings" />
        <div className="gutter-wide pb-16">
          <EmptyState title="Accounts are not configured" body="Add Firebase credentials to this deployment to enable profiles." />
        </div>
      </>
    );
  }

  if (!user || !profile) {
    return (
      <>
        <PageHeader eyebrow="Account" title="Settings" />
        <div className="gutter-wide pb-16">
          <EmptyState
            title="Sign in to manage your account"
            action={<ButtonLink href="/signin?next=/profile" size="sm">Sign in</ButtonLink>}
          />
        </div>
      </>
    );
  }

  return <ProfileForm profile={profile} uid={user.uid} />;
}

/* -------------------------------------------------------------------------
   Split out so the editable fields seed themselves from `profile` on mount,
   rather than being synchronised from it by an effect on every change — which
   would silently overwrite whatever the user had just typed.
   ------------------------------------------------------------------------- */

function ProfileForm({ profile, uid }: { profile: UserProfile; uid: string }) {
  const { signOut, setPreference, refreshProfile } = useAuth();
  const router = useRouter();
  const toggleShortcuts = useUI((s) => s.toggleShortcuts);
  const setAmbient = usePlayer((s) => s.setAmbient);
  const setPlayerQuality = usePlayer((s) => s.setQuality);

  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    name !== profile.displayName ||
    bio !== (profile.bio ?? '') ||
    interests.join() !== (profile.interests ?? []).join();

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(uid, { displayName: name.trim() || 'Viewer', bio: bio.trim(), interests });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch {
      toast('Could not save your profile', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow={`Member since ${formatDate(profile.createdAt)}`} title="Settings" />

      <div className="gutter-wide grid max-w-5xl gap-10 pb-20 lg:grid-cols-[15rem_1fr] lg:gap-16">
        {/* ---------------------------- identity --------------------------- */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex flex-col items-start gap-4">
            <Avatar src={profile.photoURL} name={profile.displayName} size={88} ring />
            <div>
              <p className="text-[15px] font-medium text-cream">{profile.displayName}</p>
              <p className="font-mono text-[11px] text-faint">@{profile.handle}</p>
              {profile.email && <p className="mt-1 truncate text-[12px] text-muted">{profile.email}</p>}
            </div>
          </div>

          <button
            onClick={async () => { await signOut(); router.push('/'); }}
            className="mt-8 inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-flare"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </aside>

        {/* ----------------------------- panels ---------------------------- */}
        <div className="space-y-12">
          <Section title="Profile" description="How you appear in rooms and on shared playlists.">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Display name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="h-11 w-full max-w-sm rounded-xl border border-line bg-ink-850 px-3.5 text-[14px] text-cream outline-none transition-colors focus:border-flare/60"
              />
            </label>

            <label className="mt-5 block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder="Optional. 200 characters."
                className="w-full max-w-lg resize-none rounded-xl border border-line bg-ink-850 px-3.5 py-2.5 text-[14px] leading-relaxed text-cream outline-none transition-colors placeholder:text-faint focus:border-flare/60"
              />
              <span className="mt-1 block text-right font-mono text-[10px] text-faint tnum sm:max-w-lg">{bio.length}/200</span>
            </label>
          </Section>

          <Section title="Interests" description="Used to weight what surfaces first on the home page.">
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((tag) => {
                const on = interests.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => setInterests((cur) => (on ? cur.filter((t) => t !== tag) : [...cur, tag]))}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-[12.5px] transition-[background-color,border-color,color] duration-250',
                      on
                        ? 'border-flare/45 bg-flare/12 text-flare'
                        : 'border-line text-cream-dim hover:border-line-strong hover:text-cream',
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Playback" description="These apply on every device you sign in on.">
            <div className="max-w-lg divide-y divide-line">
              <Toggle
                label="Autoplay the next video"
                hint="Plays the top of the Up next queue when a video ends."
                value={profile.preferences.autoplay}
                onChange={(v) => setPreference('autoplay', v)}
              />
              <Toggle
                label="Ambient glow"
                hint="Bleeds a blurred copy of the frame past the player's edges."
                value={profile.preferences.ambientGlow}
                onChange={(v) => { setPreference('ambientGlow', v); setAmbient(v); }}
              />
              <Toggle
                label="Reduce motion"
                hint="Cuts parallax, hover previews and page transitions. Your system setting is always respected on top of this."
                value={profile.preferences.reduceMotion}
                onChange={(v) => setPreference('reduceMotion', v)}
              />

              <div className="py-4">
                <p className="text-[13.5px] text-cream">Preferred quality</p>
                <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">
                  Applied to every video as it starts. YouTube&apos;s adaptive
                  streaming can still override it when bandwidth or window size
                  demand — the player says so when that happens.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {QUALITY_CHOICES.map((q) => {
                    const on = profile.preferences.defaultQuality === q;
                    return (
                      <button
                        key={q}
                        onClick={() => {
                          setPreference('defaultQuality', q);
                          // Take effect on the currently playing video too,
                          // rather than only on the next one.
                          setPlayerQuality(q, q);
                        }}
                        aria-pressed={on}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 font-mono text-[11.5px] transition-[background-color,border-color,color] duration-250',
                          on
                            ? 'border-flare/45 bg-flare/12 text-flare'
                            : 'border-line text-cream-dim hover:border-line-strong hover:text-cream',
                        )}
                      >
                        {qualityLabel(q)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={toggleShortcuts}
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-[13px] text-cream-dim transition-[border-color,color] hover:border-line-strong hover:text-cream"
            >
              <Keyboard className="h-4 w-4" /> View keyboard shortcuts
            </button>
          </Section>

          <Section
            title="YouTube account"
            description="Optional. Connect one to comment and subscribe on YouTube itself — your PRISM library works either way."
          >
            <Suspense fallback={<div className="h-10 w-40 skeleton rounded-xl" />}>
              <YouTubeConnection />
            </Suspense>
          </Section>
        </div>
      </div>

      {/* Save bar appears only when there is something to save. */}
      <motion.div
        initial={false}
        animate={{ y: dirty || saved ? 0 : 120, opacity: dirty || saved ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line chrome"
      >
        <div className="gutter-wide flex h-16 items-center justify-between gap-4">
          <p className="text-[13px] text-muted">
            {saved ? 'Saved.' : 'You have unsaved changes.'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setName(profile.displayName);
                setBio(profile.bio ?? '');
                setInterests(profile.interests ?? []);
              }}
            >
              Discard
            </Button>
            <Button size="sm" onClick={save} loading={saving}>
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save changes'}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function Section({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[15px] font-medium text-cream">
        {title === 'Playback' && <Sparkles className="h-4 w-4 text-flare" />}
        {title}
      </h2>
      <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Toggle({
  label, hint, value, onChange,
}: { label: string; hint: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-[13.5px] text-cream">{label}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-300',
          value ? 'bg-flare' : 'bg-ink-600',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className={cn('absolute top-[3px] h-[18px] w-[18px] rounded-full bg-cream shadow-sm', value ? 'left-[23px]' : 'left-[3px]')}
        />
      </button>
    </div>
  );
}

export type { UserProfile };
