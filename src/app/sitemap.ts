import type { MetadataRoute } from 'next';
import { COLLECTIONS } from '@/lib/collections';
import { STATIC_CATEGORIES } from '@/lib/youtube';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const statics: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/trending`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/collections`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/rooms`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
  ];

  const collections = COLLECTIONS.map((c) => ({
    url: `${SITE_URL}/collections/${c.slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  const categories = STATIC_CATEGORIES.map((c) => ({
    url: `${SITE_URL}/browse?category=${c.id}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...statics, ...collections, ...categories];
}
