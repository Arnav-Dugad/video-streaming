/** Extracts a YouTube video id from anything a person is likely to paste:
 *  youtu.be links, /watch?v=, /embed/, /shorts/, /live/, PRISM's own URLs, or
 *  a bare 11-character id. */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;

  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
    /\/live\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m) return m[1];
  }
  return null;
}
