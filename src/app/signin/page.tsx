import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AuthShell } from '@/components/auth/AuthShell';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to keep your history, playlists and watch parties in sync.',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      lede="Your history, playlists and rooms are waiting exactly where you left them."
      footer={
        <>
          New here?{' '}
          <Link href="/signup" className="font-medium text-cream underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-cream">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="h-64 skeleton rounded-xl" />}>
        <AuthForm mode="signin" />
      </Suspense>
    </AuthShell>
  );
}
