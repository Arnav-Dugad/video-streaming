import type { Channel, Comment, Video } from './types';
import { parseISODuration } from './format';

/* ==========================================================================
   Seeded catalogue.

   PRISM stays fully navigable before anyone provisions a YouTube API key, and
   keeps working if a live deployment blows its daily quota mid-session. Every
   id below is a real YouTube video, so thumbnails resolve and the embedded
   player plays for real — only the metadata is seeded. The UI flags this state
   explicitly rather than passing seeded numbers off as live ones.
   ========================================================================== */

interface Seed {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  duration: string;
  categoryId: string;
  publishedAt: string;
  tags: string[];
  description: string;
  /** Rough order-of-magnitude popularity, 1–10. Drives the seeded stats. */
  heat: number;
}

const SEEDS: Seed[] = [
  // ---- Music -------------------------------------------------------------
  {
    id: 'dQw4w9WgXcQ',
    title: 'Rick Astley — Never Gonna Give You Up (Official Video)',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw', channelTitle: 'Rick Astley',
    duration: 'PT3M33S', categoryId: '10', publishedAt: '2009-10-25T06:57:33Z',
    tags: ['rick astley', 'pop', '80s', 'music video'], heat: 10,
    description: 'The official video for "Never Gonna Give You Up" by Rick Astley.\n\n00:00 Intro\n00:17 Verse\n00:52 Chorus\n01:27 Verse 2\n02:00 Bridge',
  },
  {
    id: 'kJQP7kiw5Fk',
    title: 'Luis Fonsi — Despacito ft. Daddy Yankee',
    channelId: 'UCxoq-PAQeAdk_zyg8YS0JqA', channelTitle: 'Luis Fonsi',
    duration: 'PT4M42S', categoryId: '10', publishedAt: '2017-01-12T21:30:00Z',
    tags: ['despacito', 'latin', 'reggaeton', 'luis fonsi'], heat: 10,
    description: '"Despacito" disponible ya en todas las plataformas digitales.',
  },
  {
    id: 'JGwWNGJdvx8',
    title: 'Ed Sheeran — Shape of You (Official Music Video)',
    channelId: 'UC0C-w0YjGpqDXGB8IHb662A', channelTitle: 'Ed Sheeran',
    duration: 'PT4M24S', categoryId: '10', publishedAt: '2017-01-30T10:57:12Z',
    tags: ['ed sheeran', 'shape of you', 'pop', 'divide'], heat: 10,
    description: 'The official music video for Ed Sheeran — Shape Of You.',
  },
  {
    id: 'fJ9rUzIMcZQ',
    title: 'Queen — Bohemian Rhapsody (Official Video Remastered)',
    channelId: 'UCiMhD4jzUqG-IgPzUmmytRQ', channelTitle: 'Queen Official',
    duration: 'PT5M59S', categoryId: '10', publishedAt: '2008-08-01T11:06:40Z',
    tags: ['queen', 'freddie mercury', 'rock', 'bohemian rhapsody'], heat: 10,
    description: 'Taken from A Night At The Opera, 1975.\n\n00:00 A cappella\n00:49 Ballad\n02:36 Opera\n04:07 Hard rock\n05:10 Outro',
  },
  {
    id: 'hTWKbfoikeg',
    title: 'Nirvana — Smells Like Teen Spirit (Official Music Video)',
    channelId: 'UCJ2rMcOWXQ6RB4A6oyCXlPg', channelTitle: 'Nirvana',
    duration: 'PT4M39S', categoryId: '10', publishedAt: '2009-06-16T22:14:31Z',
    tags: ['nirvana', 'grunge', 'rock', '90s'], heat: 9,
    description: 'Official music video for "Smells Like Teen Spirit" from Nevermind.',
  },
  {
    id: 'YQHsXMglC9A',
    title: 'Adele — Hello (Official Music Video)',
    channelId: 'UCsRM0YB_dabtEPGPTKo-gcw', channelTitle: 'Adele',
    duration: 'PT6M7S', categoryId: '10', publishedAt: '2015-10-22T23:00:03Z',
    tags: ['adele', 'hello', 'soul', 'ballad'], heat: 9,
    description: 'Directed by Xavier Dolan. Taken from the album 25.',
  },
  {
    id: 'OPf0YbXqDm0',
    title: 'Mark Ronson — Uptown Funk ft. Bruno Mars',
    channelId: 'UCiG3wJgW5W_pBjZTQ8fjJlQ', channelTitle: 'Mark Ronson',
    duration: 'PT4M31S', categoryId: '10', publishedAt: '2014-11-19T14:00:12Z',
    tags: ['mark ronson', 'bruno mars', 'funk', 'uptown funk'], heat: 9,
    description: 'Uptown Special, out now.',
  },
  {
    id: '9bZkp7q19f0',
    title: 'PSY — GANGNAM STYLE (강남스타일) M/V',
    channelId: 'UCrDkAvwZum-UTjHmzDI2iIw', channelTitle: 'officialpsy',
    duration: 'PT4M13S', categoryId: '10', publishedAt: '2012-07-15T07:46:32Z',
    tags: ['psy', 'k-pop', 'gangnam style'], heat: 10,
    description: 'PSY — GANGNAM STYLE(강남스타일) M/V',
  },
  {
    id: '60ItHLz5WEA',
    title: 'Alan Walker — Faded',
    channelId: 'UCJrOtniJ0-NWz37R30urifQ', channelTitle: 'Alan Walker',
    duration: 'PT3M32S', categoryId: '10', publishedAt: '2015-12-03T12:00:01Z',
    tags: ['alan walker', 'edm', 'electronic', 'faded'], heat: 9,
    description: 'Faded — out now on all platforms.',
  },
  {
    id: 'kXYiU_JCYtU',
    title: 'Linkin Park — Numb (Official Music Video)',
    channelId: 'UCZU9T1ceaOgwfLRq7OKFU4Q', channelTitle: 'Linkin Park',
    duration: 'PT3M7S', categoryId: '10', publishedAt: '2007-03-02T22:34:52Z',
    tags: ['linkin park', 'numb', 'rock', 'meteora'], heat: 9,
    description: 'Numb, from the album Meteora.',
  },
  {
    id: '1w7OgIMMRc4',
    title: "Guns N' Roses — Sweet Child O' Mine (Official Music Video)",
    channelId: 'UC1w6pNGiiLdZgyNpXUnA4Zw', channelTitle: "Guns N' Roses",
    duration: 'PT5M56S', categoryId: '10', publishedAt: '2009-10-25T06:57:33Z',
    tags: ['guns n roses', 'rock', 'slash', '80s'], heat: 8,
    description: "Official video for Sweet Child O' Mine from Appetite for Destruction.",
  },
  {
    id: '2Vv-BfVoq4g',
    title: 'Ed Sheeran — Perfect (Official Music Video)',
    channelId: 'UC0C-w0YjGpqDXGB8IHb662A', channelTitle: 'Ed Sheeran',
    duration: 'PT4M40S', categoryId: '10', publishedAt: '2017-11-09T13:00:02Z',
    tags: ['ed sheeran', 'perfect', 'pop', 'divide'], heat: 9,
    description: 'The official video for Perfect, filmed in the Austrian Alps.',
  },

  // ---- Science & technology ---------------------------------------------
  {
    id: 'aircAruvnKk',
    title: 'But what is a neural network? | Deep learning, chapter 1',
    channelId: 'UCYO_jab_esuFRV4b17AJtAw', channelTitle: '3Blue1Brown',
    duration: 'PT18M40S', categoryId: '28', publishedAt: '2017-10-05T17:11:23Z',
    tags: ['neural network', 'deep learning', 'machine learning', 'mathematics'], heat: 8,
    description:
      'What are the neurons, why are there layers, and what is the math underlying it?\n\n0:00 Introduction\n1:07 What are neurons?\n2:42 Introducing layers\n5:30 Why layers?\n8:38 Edge detection\n11:34 Counting weights and biases\n12:30 How learning relates\n13:26 Notation and linear algebra\n15:17 Recap',
  },
  {
    id: 'wjZofJX0v4M',
    title: 'Transformers, the tech behind LLMs | Deep learning, chapter 5',
    channelId: 'UCYO_jab_esuFRV4b17AJtAw', channelTitle: '3Blue1Brown',
    duration: 'PT27M14S', categoryId: '28', publishedAt: '2024-04-01T14:00:00Z',
    tags: ['transformer', 'attention', 'gpt', 'llm', 'deep learning'], heat: 8,
    description:
      'Breaking down how large language models work.\n\n0:00 Predict, sample, repeat\n3:03 Inside a transformer\n6:36 Chapter layout\n7:20 The premise of deep learning\n12:27 Word embeddings\n18:25 Embeddings beyond words\n20:22 Unembedding\n22:22 Softmax with temperature\n26:03 Up next',
  },
  {
    id: 'zjkBMFhNj_g',
    title: '[1hr Talk] Intro to Large Language Models',
    channelId: 'UCXUPKJO5MZQN11PqgIvyuvQ', channelTitle: 'Andrej Karpathy',
    duration: 'PT59M48S', categoryId: '28', publishedAt: '2023-11-22T18:00:00Z',
    tags: ['llm', 'ai', 'karpathy', 'machine learning', 'gpt'], heat: 8,
    description:
      'A general-audience introduction to Large Language Models.\n\n00:00:00 Intro: Large Language Model (LLM) talk\n00:00:20 LLM Inference\n00:04:17 LLM Training\n00:08:58 LLM dreams\n00:11:22 How do they work?\n00:14:14 Finetuning into an Assistant\n00:17:52 Summary so far\n00:21:05 Appendix: comparisons, labeling docs, RLHF',
  },
  {
    id: 'kCc8FmEb1nY',
    title: "Let's build GPT: from scratch, in code, spelled out.",
    channelId: 'UCXUPKJO5MZQN11PqgIvyuvQ', channelTitle: 'Andrej Karpathy',
    duration: 'PT1H56M20S', categoryId: '28', publishedAt: '2023-01-17T05:00:00Z',
    tags: ['gpt', 'transformer', 'pytorch', 'programming', 'ai'], heat: 7,
    description:
      'We build a Generatively Pretrained Transformer (GPT), following the paper "Attention is All You Need".\n\n00:00:00 intro\n00:07:52 reading and exploring the data\n00:09:28 tokenization, train/val split\n00:22:11 data loader: batches of chunks\n00:32:32 simplest baseline: bigram model\n01:00:18 self-attention\n01:19:11 multi-headed self-attention',
  },
  {
    id: '8aGhZQkoFbQ',
    title: 'What the heck is the event loop anyway? | JSConf EU',
    channelId: 'UCzoVCacndDCfGDf41P-z0iA', channelTitle: 'JSConf',
    duration: 'PT26M53S', categoryId: '28', publishedAt: '2014-10-09T15:26:38Z',
    tags: ['javascript', 'event loop', 'jsconf', 'programming', 'async'], heat: 7,
    description: 'Philip Roberts explains the JavaScript event loop with a live visualisation.',
  },
  {
    id: 'fNk_zzaMoSs',
    title: 'Vectors | Chapter 1, Essence of linear algebra',
    channelId: 'UCYO_jab_esuFRV4b17AJtAw', channelTitle: '3Blue1Brown',
    duration: 'PT9M52S', categoryId: '28', publishedAt: '2016-08-06T00:00:00Z',
    tags: ['linear algebra', 'vectors', 'mathematics', 'education'], heat: 7,
    description: 'Kicking off the linear algebra lessons: what a vector actually is, from three perspectives.',
  },
  {
    id: 'WUvTyaaNkzM',
    title: 'The essence of calculus',
    channelId: 'UCYO_jab_esuFRV4b17AJtAw', channelTitle: '3Blue1Brown',
    duration: 'PT17M4S', categoryId: '28', publishedAt: '2017-04-28T00:00:00Z',
    tags: ['calculus', 'mathematics', 'derivatives', 'education'], heat: 7,
    description: 'What is calculus, really? Rediscovering it from the ground up.',
  },
  {
    id: 'HeQX2HjkcNo',
    title: 'The Map of Mathematics',
    channelId: 'UCxqAWLTk1CmBvZFPzeZMd9A', channelTitle: 'Domain of Science',
    duration: 'PT11M6S', categoryId: '28', publishedAt: '2017-02-01T00:00:00Z',
    tags: ['mathematics', 'science', 'map', 'education'], heat: 6,
    description: 'The entire field of mathematics summarised in a single map.',
  },
  {
    id: 'Unzc731iCUY',
    title: 'How to Speak',
    channelId: 'UCEBb1b_L6zDS3xTUrIALZOw', channelTitle: 'MIT OpenCourseWare',
    duration: 'PT1H3M45S', categoryId: '27', publishedAt: '2019-06-19T00:00:00Z',
    tags: ['communication', 'lecture', 'mit', 'public speaking'], heat: 6,
    description: 'Patrick Winston on how to give an effective talk.',
  },

  // ---- Talks & education -------------------------------------------------
  {
    id: 'Ks-_Mh1QhMc',
    title: 'Your body language may shape who you are | Amy Cuddy',
    channelId: 'UCAuUUnT6oDeKwE6v1NGQxug', channelTitle: 'TED',
    duration: 'PT21M3S', categoryId: '27', publishedAt: '2012-10-01T15:04:16Z',
    tags: ['ted talk', 'psychology', 'body language', 'confidence'], heat: 8,
    description: 'Social psychologist Amy Cuddy argues that "power posing" can affect our brains.',
  },
  {
    id: 'qp0HIF3SfI4',
    title: 'How great leaders inspire action | Simon Sinek',
    channelId: 'UCAuUUnT6oDeKwE6v1NGQxug', channelTitle: 'TED',
    duration: 'PT18M35S', categoryId: '27', publishedAt: '2010-05-04T15:03:14Z',
    tags: ['ted talk', 'leadership', 'golden circle', 'business'], heat: 8,
    description: 'Simon Sinek presents a simple but powerful model for inspirational leadership.',
  },
  {
    id: 'iCvmsMzlF7o',
    title: 'The power of vulnerability | Brené Brown',
    channelId: 'UCAuUUnT6oDeKwE6v1NGQxug', channelTitle: 'TED',
    duration: 'PT20M19S', categoryId: '27', publishedAt: '2011-01-03T16:11:26Z',
    tags: ['ted talk', 'vulnerability', 'psychology', 'connection'], heat: 7,
    description: 'Brené Brown studies human connection — our ability to empathise, belong, love.',
  },
  {
    id: 'arj7oStGLkU',
    title: 'Inside the mind of a master procrastinator | Tim Urban',
    channelId: 'UCAuUUnT6oDeKwE6v1NGQxug', channelTitle: 'TED',
    duration: 'PT14M4S', categoryId: '27', publishedAt: '2016-04-06T14:56:32Z',
    tags: ['ted talk', 'procrastination', 'productivity', 'humour'], heat: 8,
    description: 'Tim Urban takes us on a tour through YouTube binges and Wikipedia rabbit holes.',
  },
  {
    id: 'H14bBuluwB8',
    title: 'Grit: the power of passion and perseverance | Angela Lee Duckworth',
    channelId: 'UCAuUUnT6oDeKwE6v1NGQxug', channelTitle: 'TED',
    duration: 'PT6M12S', categoryId: '27', publishedAt: '2013-05-09T15:07:31Z',
    tags: ['ted talk', 'grit', 'psychology', 'education'], heat: 7,
    description: 'Leaving a demanding job to teach maths taught Angela Lee Duckworth about success.',
  },
  {
    id: 'eIho2S0ZahI',
    title: 'How to speak so that people want to listen | Julian Treasure',
    channelId: 'UCAuUUnT6oDeKwE6v1NGQxug', channelTitle: 'TED',
    duration: 'PT9M58S', categoryId: '27', publishedAt: '2014-06-27T15:03:24Z',
    tags: ['ted talk', 'communication', 'voice', 'speaking'], heat: 7,
    description: 'Sound expert Julian Treasure demonstrates the how-to of powerful speaking.',
  },
];

/* ------------------------------------------------------------------------ */

/** Deterministic pseudo-random in [0,1) from a string. Keeps seeded stats
 *  stable between server and client so hydration never mismatches. */
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/* The curve is tuned so heat 10 lands around a billion views and heat 6
   around a few million — roughly the real spread between a global music video
   and a well-regarded explainer. Like and comment ratios follow the rates
   YouTube actually sees (~1% and ~4% of likes respectively). */
function statsFor(seed: Seed) {
  const base = Math.pow(10, 2.2 + seed.heat * 0.7);
  const views = Math.round(base * (0.6 + rand(seed.id) * 0.8));
  const likes = Math.round(views * (0.006 + rand(seed.id + 'l') * 0.012));
  const comments = Math.round(likes * (0.015 + rand(seed.id + 'c') * 0.045));
  return { viewCount: views, likeCount: likes, commentCount: comments };
}

function toVideo(seed: Seed): Video {
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    channelId: seed.channelId,
    channelTitle: seed.channelTitle,
    publishedAt: seed.publishedAt,
    thumbnail: `https://i.ytimg.com/vi/${seed.id}/mqdefault.jpg`,
    thumbnailHq: `https://i.ytimg.com/vi/${seed.id}/maxresdefault.jpg`,
    duration: seed.duration,
    durationSeconds: parseISODuration(seed.duration),
    tags: seed.tags,
    categoryId: seed.categoryId,
    live: false,
    ...statsFor(seed),
  };
}

export const DEMO_CATALOGUE: Video[] = SEEDS.map(toVideo);

export function demoChannels(): Channel[] {
  const byId = new Map<string, Channel>();
  for (const seed of SEEDS) {
    if (byId.has(seed.channelId)) {
      const c = byId.get(seed.channelId)!;
      c.videoCount = (c.videoCount ?? 0) + 1;
      continue;
    }
    byId.set(seed.channelId, {
      id: seed.channelId,
      title: seed.channelTitle,
      description: `${seed.channelTitle} on PRISM.`,
      // Channel avatars are not addressable without the API; the UI falls back
      // to a generated monogram when this is empty.
      avatar: '',
      subscriberCount: Math.round(Math.pow(10, 3.4 + seed.heat * 0.38)),
      videoCount: 1,
      viewCount: Math.round(Math.pow(10, 5.6 + seed.heat * 0.38)),
    });
  }
  return [...byId.values()];
}

const COMMENT_TEMPLATES = [
  'Came here from a playlist three hours deep and I regret nothing.',
  'The pacing on this is genuinely masterful. Rewatched the middle section twice.',
  'Whoever edited this deserves a raise.',
  'I show this to every new person on my team. It just clicks.',
  'Still holds up years later, which says everything.',
  'The part around the halfway mark completely reframed how I think about this.',
  'Bookmarking this for the fifth time. One day I will actually finish it.',
  'Underrated. Should have ten times the views it does.',
  'Watching this at 2am instead of sleeping. Worth it.',
  'The production quality here is quietly incredible.',
];

const COMMENT_AUTHORS = [
  'Mara Ellison', 'D. Okonkwo', 'shortwave', 'Tomás Rivera', 'Kenji A.',
  'Priya Raghavan', 'null_pointer', 'Astrid Lindqvist', 'Sam Oyelaran', 'quiet hours',
];

export function demoComments(videoId: string): Comment[] {
  const count = 6 + Math.floor(rand(videoId) * 4);
  return Array.from({ length: count }, (_, i) => {
    const r = rand(`${videoId}:${i}`);
    return {
      id: `${videoId}-c${i}`,
      author: COMMENT_AUTHORS[Math.floor(r * COMMENT_AUTHORS.length)],
      authorAvatar: '',
      text: COMMENT_TEMPLATES[Math.floor(rand(`${videoId}:t${i}`) * COMMENT_TEMPLATES.length)],
      likeCount: Math.floor(r * 4200),
      publishedAt: new Date(Date.now() - Math.floor(r * 240) * 86400000).toISOString(),
      replyCount: Math.floor(r * 12),
    };
  }).sort((a, b) => b.likeCount - a.likeCount);
}
