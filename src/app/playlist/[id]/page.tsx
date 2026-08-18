import type { Metadata } from 'next';
import { PlaylistClient } from '@/components/library/PlaylistClient';

export const metadata: Metadata = {
  title: 'Playlist',
  // Playlists can be private or unlisted; the rules decide who may read one,
  // and nothing here should end up in an index either way.
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function PlaylistPage({ params }: { params: Params }) {
  const { id } = await params;
  return <PlaylistClient playlistId={id} />;
}
