'use client';

import { useMemo, useRef, useState } from 'react';
import { qrMatrix } from '@/lib/qr';
import { Check, Copy, Download, Share2 } from 'lucide-react';

import { toast } from '@/lib/store';
import { cn } from '@/lib/cn';

/* ==========================================================================
   The room, as a square.

   Reading a six-character code down a phone line works; pointing a camera at
   a screen is faster, and it carries the whole link rather than a code the
   other person then has to type somewhere. Both are offered — the code is
   still the thing you say out loud.

   Drawn as an SVG rather than fetched from a QR service: the room URL is not
   something to hand to a third party, and an <img> from someone else's server
   would fail the moment they rate-limit us.

   Three decisions here are about scanning, not looks, and none of them are
   negotiable for the sake of the palette:

     · Dark modules on a light field, not the inverse. An inverted code reads
       on a recent iPhone and fails on plenty of everything else, and a QR
       nobody's phone will read is decoration.
     · A four-module quiet zone, which is what the specification asks for.
       Two looks tidier and costs reads at an angle.
     · Error correction Q — 25% recoverable, against the usual L. This gets
       scanned off a screen that is also playing video, at whatever angle the
       other person is sitting at.

   The brand lives in the frame around the code and in the softened corners of
   the modules, which is as far into a QR as styling can go safely.
   ========================================================================== */

const QUIET = 4;
const DARK = '#0a0a0d';
const LIGHT = '#f4f1ea';

interface Props {
  url: string;
  code: string;
  /** Rendered size in CSS pixels. */
  size?: number;
  className?: string;
}

export function RoomQr({ url, code, size = 200, className }: Props) {
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const model = useMemo(() => {
    const { count, isDark } = qrMatrix(url, 'Q');
    const dots: { x: number; y: number }[] = [];
    const eyes: { x: number; y: number }[] = [];

    const inEye = (r: number, c: number) =>
      (r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7);

    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!isDark(r, c)) continue;
        // The three finder patterns are drawn as whole shapes below, so their
        // modules are skipped here rather than rendered as loose dots.
        if (inEye(r, c)) continue;
        dots.push({ x: c, y: r });
      }
    }

    eyes.push({ x: 0, y: 0 }, { x: count - 7, y: 0 }, { x: 0, y: count - 7 });

    return { count, dots, eyes };
  }, [url]);

  const span = model.count + QUIET * 2;

  /* ------------------------------ actions ------------------------------- */

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast('Could not copy the link', { tone: 'error' }); }
  };

  /** Rasterise the SVG we already drew, at 4x, so the file is crisp when it
   *  lands in a chat that re-compresses it. */
  const toBlob = async (): Promise<Blob | null> => {
    const svg = svgRef.current;
    if (!svg) return null;

    const source = new XMLSerializer().serializeToString(svg);
    const svgUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('render failed'));
        image.src = svgUrl;
      });

      const scale = 4;
      const canvas = document.createElement('canvas');
      canvas.width = size * scale;
      canvas.height = size * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // The PNG carries its own light field: dropped into a dark chat, a
      // transparent background would leave the code inverted and unreadable.
      ctx.fillStyle = LIGHT;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  const download = async () => {
    const blob = await toBlob();
    if (!blob) { toast('Could not render the code', { tone: 'error' }); return; }
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `prism-room-${code}.png`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const share = async () => {
    const blob = await toBlob();
    const file = blob ? new File([blob], `prism-room-${code}.png`, { type: 'image/png' }) : null;

    // Sharing the picture is the point — a code someone can scan off their own
    // screen. Where files cannot be shared, the link alone still works.
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Join room ${code}`, text: url });
        return;
      } catch { return; /* dismissed */ }
    }
    if (navigator.share) {
      try { await navigator.share({ title: `Join room ${code}`, url }); return; } catch { return; }
    }
    copy();
  };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="rounded-2xl bg-gradient-to-br from-flare/70 to-flare-deep/60 p-[3px]">
        <div className="rounded-[calc(1rem-1px)] bg-[#f4f1ea] p-2">
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox={`0 0 ${span} ${span}`}
            shapeRendering="geometricPrecision"
            role="img"
            aria-label={`QR code linking to room ${code}`}
          >
            <rect width={span} height={span} fill={LIGHT} />
            <g transform={`translate(${QUIET} ${QUIET})`}>
              {model.dots.map((d, i) => (
                <rect
                  key={i}
                  x={d.x + 0.05}
                  y={d.y + 0.05}
                  width={0.9}
                  height={0.9}
                  rx={0.22}
                  fill={DARK}
                />
              ))}

              {/* The finder patterns, drawn as three shapes rather than 147
                  loose modules: a dark 7x7 ring, a light 5x5 inside it, a dark
                  3x3 at the centre. Exactly the specified geometry, with the
                  corners rounded. */}
              {model.eyes.map((e, i) => (
                <g key={`eye-${i}`} transform={`translate(${e.x} ${e.y})`}>
                  <rect x={0} y={0} width={7} height={7} rx={1.8} fill={DARK} />
                  <rect x={1} y={1} width={5} height={5} rx={1.2} fill={LIGHT} />
                  <rect x={2} y={2} width={3} height={3} rx={0.8} fill={DARK} />
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>

      <p className="mt-3 font-mono text-[15px] font-semibold tracking-[0.24em] text-cream">{code}</p>
      <p className="mt-1 text-center text-[11.5px] leading-relaxed text-faint">
        Point a camera at this, or read the code out.
      </p>

      <div className="mt-3 flex items-center gap-1">
        <Action onClick={copy} label={copied ? 'Copied' : 'Copy link'}>
          {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </Action>
        <Action onClick={share} label="Share">
          <Share2 className="h-3.5 w-3.5" /> Share
        </Action>
        <Action onClick={download} label="Save the code as an image">
          <Download className="h-3.5 w-3.5" /> Save
        </Action>
      </div>
    </div>
  );
}

function Action({
  children, onClick, label,
}: { children: React.ReactNode; onClick(): void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] text-cream-dim transition-[background-color,color,transform] duration-200 hover:bg-cream/10 hover:text-cream active:scale-95"
    >
      {children}
    </button>
  );
}
