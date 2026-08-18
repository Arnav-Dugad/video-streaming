import type { Metadata } from 'next';
import { RoomClient } from '@/components/rooms/RoomClient';

export const metadata: Metadata = {
  title: 'Watch party',
  description: 'Watch in sync with everyone in the room.',
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function RoomPage({ params }: { params: Params }) {
  const { id } = await params;
  return <RoomClient roomId={id} />;
}
