import type { Metadata } from 'next';
import { SmartPlaylistClient } from '@/components/library/SmartPlaylistClient';

export const metadata: Metadata = {
  title: 'Smart playlist',
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function SmartPlaylistPage({ params }: { params: Params }) {
  const { id } = await params;
  return <SmartPlaylistClient smartId={id} />;
}
