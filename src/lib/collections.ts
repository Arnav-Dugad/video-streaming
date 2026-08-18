/* ==========================================================================
   Collections — shapes and rules only.

   Nothing here reaches the network, so client components can import it. The
   generator that actually assembles the live set is `collections.server.ts`.

   A collection is not a hardcoded list of videos. It is a *rule* plus a
   presentation. Two kinds exist:

     · structural — a rule over the catalogue that is always true
                    ("nothing under twenty minutes"), with a stable slug
     · topic      — a subject that is demonstrably busy right now, discovered
                    by counting tags across the live trending chart

   Because both are rules rather than stored lists, a collection page can be
   resolved from its slug alone with no shared state between requests.
   ========================================================================== */

export type CollectionKind = 'structural' | 'topic';

export interface Collection {
  slug: string;
  kind: CollectionKind;
  title: string;
  /** One factual line for the card. Never marketing copy. */
  blurb: string;
  /** Longer framing on the collection's own page. */
  intro: string;
  /** Hue for the card wash, kept in the brand's warm/cool split. */
  hue: number;
  /** How the page fetches it. */
  rule: CollectionRule;
  /** Populated by the generator for topic collections. */
  meta?: { count: number; leadChannel?: string };
}

export interface CollectionRule {
  query?: string;
  duration?: 'any' | 'short' | 'medium' | 'long';
  order?: 'relevance' | 'viewCount' | 'date';
  /** Restrict to uploads within this many hours. */
  withinHours?: number;
  /** Pull from the trending chart rather than search. */
  fromTrending?: boolean;
  categoryId?: string;
}

/* --------------------------- structural set ----------------------------- */

/** Always present, always meaningful, and independent of what is trending. */
export const STRUCTURAL: Collection[] = [
  {
    slug: 'the-long-haul',
    kind: 'structural',
    title: 'The Long Haul',
    blurb: 'Nothing in here runs under twenty minutes.',
    intro:
      'Everything below is long-form by rule, not by taste. These are the videos that reward an actual sitting — one argument developed properly, or a subject taken apart with the patience the internet usually refuses.',
    hue: 24,
    rule: { query: 'documentary lecture deep dive', duration: 'long' },
  },
  {
    slug: 'short-and-perfect',
    kind: 'structural',
    title: 'Short and Perfect',
    blurb: 'Under four minutes, and not one of them wasted.',
    intro:
      'Compression is a craft. Everything here says what it came to say and then stops — the animated short, the single sharp demonstration, the joke that lands and leaves.',
    hue: 46,
    rule: { query: 'short film animation', duration: 'short' },
  },
  {
    slug: 'landed-today',
    kind: 'structural',
    title: 'Landed Today',
    blurb: 'Published in the last twenty-four hours.',
    intro:
      'The newest end of the catalogue, before anything has had time to accumulate a view count. Sorted by upload time, so this is genuinely what went up today rather than what an algorithm decided you missed.',
    hue: 206,
    rule: { withinHours: 24, order: 'date', query: 'new' },
  },
  {
    slug: 'most-watched',
    kind: 'structural',
    title: 'Most Watched',
    blurb: 'Ranked by view count. No recency bonus, no personalisation.',
    intro:
      'The plainest possible ranking: how many people have actually watched it. No decay curve, no engagement weighting, no guess about what you in particular might want.',
    hue: 14,
    rule: { fromTrending: true, order: 'viewCount' },
  },
];

/* ------------------------------ slugs ----------------------------------- */

const TOPIC_PREFIX = 'topic-';

export function topicSlug(topic: string): string {
  return TOPIC_PREFIX + topic.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function isTopicSlug(slug: string): boolean {
  return slug.startsWith(TOPIC_PREFIX) && slug.length > TOPIC_PREFIX.length;
}

/** Slugs are lossy, so the recovered phrase is a search query, not an exact
 *  tag. That is fine — it is fed to search either way. */
export function topicFromSlug(slug: string): string {
  return slug.slice(TOPIC_PREFIX.length).replace(/-/g, ' ');
}

export function structuralBySlug(slug: string): Collection | undefined {
  return STRUCTURAL.find((c) => c.slug === slug);
}

/** Hue for a topic card, derived from its own name so a given topic keeps the
 *  same colour between builds. Constrained to the brand's two arcs. */
export function topicHue(topic: string): number {
  let h = 0;
  for (let i = 0; i < topic.length; i++) h = (h * 31 + topic.charCodeAt(i)) % 1000;
  const warm = h % 2 === 0;
  return warm ? 8 + (h % 44) : 198 + (h % 52);
}

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 && !/^\d/.test(w) ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1)))
    .join(' ');
}

/* ------------------------------- moods ---------------------------------- */

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
