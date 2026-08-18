import type { Metadata } from 'next';
import { ProfileClient } from '@/components/profile/ProfileClient';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your profile, playback preferences and account.',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileClient />;
}
