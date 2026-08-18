/** Editorially curated runs. Each one is a saved query with a point of view —
 *  the thing an algorithmic feed cannot give you. Rendered on /collections and
 *  seeded into the home page. */

export interface Collection {
  slug: string;
  title: string;
  /** Shown on the card. One sentence, no marketing voice. */
  blurb: string;
  /** Long-form intro on the collection page. */
  intro: string;
  query: string;
  /** Hue used for the card's wash. Kept in the 8–52° / 200–260° ranges so the
   *  set stays within the brand's warm/cool split. */
  hue: number;
  curator: string;
  duration?: 'any' | 'short' | 'medium' | 'long';
  order?: 'relevance' | 'viewCount' | 'date';
}

export const COLLECTIONS: Collection[] = [
  {
    slug: 'the-long-read',
    title: 'The Long Read',
    blurb: 'Hour-plus documentaries and lectures for a Sunday that has nowhere to be.',
    intro:
      'Everything here runs past sixty minutes. These are the videos that reward a real sitting — a single argument developed properly, or a subject taken apart with the patience the internet usually refuses.',
    query: 'documentary lecture full length',
    hue: 24, curator: 'PRISM Editorial', duration: 'long',
  },
  {
    slug: 'built-from-scratch',
    title: 'Built From Scratch',
    blurb: 'People making the whole thing themselves, from first principle to finished object.',
    intro:
      'A compiler. A guitar. A CPU on breadboard. The pleasure of these is watching competence applied end to end, with nothing skipped and no sponsor break where the hard part should be.',
    query: 'built from scratch how it is made engineering',
    hue: 38, curator: 'PRISM Editorial',
  },
  {
    slug: 'quiet-hours',
    title: 'Quiet Hours',
    blurb: 'Low-stimulus video for late at night. Nothing shouts.',
    intro:
      'No jump cuts, no intro stinger, no one asking you to smash anything. Slow footage, ambient sound, and long takes — for when you want the screen on but the volume of the internet turned down.',
    query: 'ambient relaxing slow tv nature sounds',
    hue: 218, curator: 'PRISM Editorial', duration: 'long',
  },
  {
    slug: 'first-principles',
    title: 'First Principles',
    blurb: 'Explanations that start at the bottom and actually get somewhere.',
    intro:
      'The rare videos that refuse to hand-wave. Maths, physics and computing, explained by people who understood it well enough to rebuild the intuition rather than recite the result.',
    query: 'explained from first principles mathematics physics intuition',
    hue: 232, curator: 'PRISM Editorial',
  },
  {
    slug: 'the-archive',
    title: 'The Archive',
    blurb: 'Footage that has outlived the moment it was shot in.',
    intro:
      'Concert films, broadcast fragments, and recordings that only exist because somebody kept a tape. The internet is the largest accidental archive ever assembled; this is a walk through part of it.',
    query: 'archive footage restored classic performance',
    hue: 14, curator: 'PRISM Editorial', order: 'relevance',
  },
  {
    slug: 'short-and-perfect',
    title: 'Short and Perfect',
    blurb: 'Under four minutes, not one of them wasted.',
    intro:
      'Compression is a craft. Everything in here says what it came to say and then stops — the animated short, the single sharp demonstration, the joke that lands and leaves.',
    query: 'short film animation award winning',
    hue: 46, curator: 'PRISM Editorial', duration: 'short',
  },
  {
    slug: 'live-performance',
    title: 'Live, In One Take',
    blurb: 'Musicians playing it properly, with the mistakes left in.',
    intro:
      'Tiny Desk sets, live sessions, and full concert recordings. No overdubs to hide behind — just the difference between a record and a room.',
    query: 'live session full concert performance one take',
    hue: 8, curator: 'PRISM Editorial', duration: 'medium',
  },
  {
    slug: 'how-the-world-works',
    title: 'How the World Works',
    blurb: 'Supply chains, infrastructure, and the machinery nobody looks at.',
    intro:
      'Where your water comes from, how a port schedules itself, why a bridge stands up. Systems journalism for the parts of civilisation that only become visible when they fail.',
    query: 'infrastructure logistics how it works engineering explained',
    hue: 206, curator: 'PRISM Editorial',
  },
];

export function collectionBySlug(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

/** Mood chips on the home page. A deliberately non-algorithmic entry point:
 *  you say how you want to feel, not what you want to watch. */
export const MOODS: { label: string; query: string; hue: number }[] = [
  { label: 'Learn something hard', query: 'in depth technical lecture', hue: 232 },
  { label: 'Laugh', query: 'stand up comedy sketch', hue: 44 },
  { label: 'Calm down', query: 'ambient calm slow nature', hue: 200 },
  { label: 'Feel something', query: 'short documentary human story', hue: 12 },
  { label: 'Get moving', query: 'workout training motivation', hue: 30 },
  { label: 'Go deep on one thing', query: 'video essay analysis long form', hue: 246 },
  { label: 'Be amazed', query: 'incredible engineering feat record', hue: 20 },
  { label: 'Cook', query: 'recipe cooking technique kitchen', hue: 36 },
];
