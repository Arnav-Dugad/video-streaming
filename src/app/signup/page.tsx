import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AuthShell } from '@/components/auth/AuthShell';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a PRISM account to save videos, build playlists and host watch parties.',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Make it yours"
      lede="An account gets you resume-anywhere playback, playlists, watch parties and a library that actually remembers."
      footer={
        <>
          Already have one?{' '}
          <Link href="/signin" className="font-medium text-cream underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-cream">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="h-64 skeleton rounded-xl" />}>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
