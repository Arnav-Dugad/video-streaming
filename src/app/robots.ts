import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://prism-stream.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Auth surfaces and per-user pages have nothing to index, and /watch
        // and /search generate unbounded URL space from query strings.
        disallow: ['/api/', '/library', '/profile', '/rooms/', '/signin', '/signup', '/search'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
