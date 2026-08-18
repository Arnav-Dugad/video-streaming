import type { Metadata } from 'next';
import { RoomsClient } from '@/components/rooms/RoomsClient';

export const metadata: Metadata = {
  title: 'Watch parties',
  description: 'Watch in sync with other people. Share a six-character code and everyone lands on the same frame.',
};

export default function RoomsPage() {
  return <RoomsClient />;
}
