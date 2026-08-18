'use client';

import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-cream text-ink-950 hover:bg-white active:bg-cream-dim shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset]',
  secondary:
    'bg-ink-700 text-cream hover:bg-ink-600 border border-line-strong',
  ghost:
    'text-cream-dim hover:text-cream hover:bg-ink-800',
  outline:
    'border border-line-strong text-cream hover:border-cream/35 hover:bg-cream/[0.04]',
  danger:
    'bg-flare text-white hover:bg-flare-soft',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
};

const BASE =
  'relative inline-flex items-center justify-center font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,transform,opacity] duration-200 ' +
  'ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.975] ' +
  'disabled:pointer-events-none disabled:opacity-45';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, CommonProps & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ variant = 'primary', size = 'md', className, children, loading, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
        {...rest}
      >
        {loading && (
          <span
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
            aria-hidden
          />
        )}
        {children}
      </button>
    );
  },
);

export function ButtonLink({
  href, variant = 'primary', size = 'md', className, children, prefetch,
}: CommonProps & { href: string; prefetch?: boolean }) {
  return (
    <Link href={href} prefetch={prefetch} className={cn(BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}

/** Circular icon button — the player and card overlays use nothing else. */
export function IconButton({
  label, className, children, active, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-full text-cream-dim',
        'transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:bg-cream/10 hover:text-cream active:scale-90',
        active && 'text-flare',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
