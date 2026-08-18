import { NextResponse } from 'next/server';
import { revoke } from '@/lib/youtube-oauth';

/** POST rather than GET so a prefetch or an <img> tag can never disconnect
 *  somebody by accident. */
export async function POST() {
  await revoke();
  return NextResponse.json({ connected: false });
}
