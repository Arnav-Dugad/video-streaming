'use client';

import { useEffect, useState } from 'react';

/* ==========================================================================
   Ambient palette.

   The live video frame is not reachable. The player is a cross-origin iframe,
   so its <video> element cannot be touched and `drawImage` on the iframe is
   not a thing browsers allow — there is no API that returns pixels from
   another origin's compositor. Anyone claiming otherwise is describing a
   same-origin <video>, which this is not.

   What *is* reachable is the thumbnail, and routing it through Next's image
   optimiser makes it same-origin, so a canvas built from it is not tainted.
   Sampling a 32x18 downscale gives the frame's dominant colours in about a
   millisecond.

   This replaces a `filter: blur(70px)` over a 1280px bitmap — one of the most
   expensive things you can ask a compositor to do every frame — with three
   radial gradients. It is both cheaper and more controllable, and the colours
   can be animated between videos instead of cross-fading two large images.
   ========================================================================== */

export interface Ambient {
  colors: [string, string, string];
  /** False until extraction succeeds, so callers can hold the old palette. */
  ready: boolean;
}

const FALLBACK: Ambient['colors'] = ['#2a1f1c', '#1a1f2e', '#241a24'];

/** Next's optimiser only accepts widths from its configured size list. */
function optimised(src: string, width = 64): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=50`;
}

export function useAmbientPalette(src: string | undefined, enabled = true): Ambient {
  const [ambient, setAmbient] = useState<Ambient>({ colors: FALLBACK, ready: false });

  useEffect(() => {
    if (!enabled || !src) return;
    let alive = true;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    img.onload = () => {
      if (!alive) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 18;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, 32, 18);
        const { data } = ctx.getImageData(0, 0, 32, 18);
        const colors = dominant(data);
        if (colors) setAmbient({ colors, ready: true });
      } catch {
        // A tainted canvas means the optimiser was bypassed; the caller keeps
        // the fallback palette, which is a valid look rather than a failure.
      }
    };

    // A dead thumbnail is not worth reporting — the fallback palette stands.
    img.onerror = () => {};
    img.src = optimised(src);

    return () => { alive = false; img.onload = null; img.onerror = null; };
  }, [src, enabled]);

  return ambient;
}

/* ------------------------------ extraction ------------------------------ */

/**
 * Coarse bucket quantisation. Grouping into 32 levels per channel collapses
 * the near-identical shades that dominate any photograph, so the counts
 * describe regions of the image rather than individual pixels.
 */
function dominant(data: Uint8ClampedArray): Ambient['colors'] | null {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (data[i + 3] < 128) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Near-black and near-white carry no hue; including them would make every
    // palette grey, because most frames are mostly dark or mostly sky.
    if (max < 28 || min > 236) continue;

    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key);
    if (bucket) { bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1; }
    else buckets.set(key, { r, g, b, n: 1 });
  }

  if (buckets.size === 0) return null;

  const ranked = [...buckets.values()]
    .map((b) => {
      const r = b.r / b.n;
      const g = b.g / b.n;
      const b2 = b.b / b.n;
      const max = Math.max(r, g, b2);
      const min = Math.min(r, g, b2);
      const saturation = max === 0 ? 0 : (max - min) / max;
      // Weight by area, but favour colour over mud — a large grey region is
      // less useful as a glow than a smaller vivid one.
      return { r, g, b: b2, score: b.n * (0.35 + saturation) };
    })
    .sort((x, y) => y.score - x.score);

  const picked: typeof ranked = [];
  for (const candidate of ranked) {
    // Reject anything too close to a colour already chosen, or all three end
    // up being the same hue at slightly different brightness.
    const tooClose = picked.some(
      (p) => Math.abs(p.r - candidate.r) + Math.abs(p.g - candidate.g) + Math.abs(p.b - candidate.b) < 90,
    );
    if (tooClose) continue;
    picked.push(candidate);
    if (picked.length === 3) break;
  }

  while (picked.length < 3) picked.push(ranked[picked.length % ranked.length]);

  return picked.map((c) => toGlow(c.r, c.g, c.b)) as Ambient['colors'];
}

/** Lifts saturation and clamps lightness so the glow reads on a near-black
 *  page without ever washing out the video it surrounds. */
function toGlow(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  const saturation = Math.min(0.92, Math.max(0.42, s * 1.5));
  const lightness = Math.min(0.6, Math.max(0.3, l * 1.25));
  return hslToCss(h, saturation, lightness);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}
