import type { MetadataRoute } from 'next';
import { COLLECTIONS } from '@/lib/collections';
import { STATIC_CATEGORIES } from '@/lib/youtube';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://prism-stream.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const statics: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE}/browse`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/trending`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/collections`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/rooms`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
  ];

  const collections = COLLECTIONS.map((c) => ({
    url: `${SITE}/collections/${c.slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  const categories = STATIC_CATEGORIES.map((c) => ({
    url: `${SITE}/browse?category=${c.id}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...statics, ...collections, ...categories];
}
