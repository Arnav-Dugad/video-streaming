import type { ReactNode } from 'react';
import { Reveal, RevealText } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';

export function PageHeader({
  eyebrow, title, lede, actions, className,
}: {
  eyebrow?: string; title: string; lede?: string; actions?: ReactNode; className?: string;
}) {
  return (
    <header className={cn('gutter-wide pb-8 pt-10 sm:pb-10 sm:pt-14', className)}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          {eyebrow && <Reveal><p className="eyebrow mb-3">{eyebrow}</p></Reveal>}
          <h1 className="display text-[clamp(2.1rem,5.2vw,3.8rem)] text-cream">
            <RevealText text={title} />
          </h1>
          {lede && (
            <Reveal delay={0.12}>
              <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted">{lede}</p>
            </Reveal>
          )}
        </div>
        {actions && <Reveal delay={0.16} className="shrink-0">{actions}</Reveal>}
      </div>
    </header>
  );
}

export function EmptyState({
  icon, title, body, action,
}: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-20 text-center">
      {icon && <div className="mb-4 text-faint">{icon}</div>}
      <p className="text-[15px] font-medium text-cream">{title}</p>
      {body && <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
