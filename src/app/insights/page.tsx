import type { Metadata } from 'next';
import { InsightsClient } from '@/components/insights/InsightsClient';

export const metadata: Metadata = {
  title: 'Your year in watching',
  description: 'What you actually watched, drawn from your own history.',
  robots: { index: false, follow: false },
};

export default function InsightsPage() {
  return <InsightsClient />;
}
