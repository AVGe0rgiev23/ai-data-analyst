'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

/* ── Button ───────────────────────────────────────────────────────────────
   Four intents, three sizes. Every variant keeps a visible focus ring and a
   distinct pressed state; nothing communicates by colour alone. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap ' +
  'transition-[background-color,border-color,color,opacity] duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-45 active:translate-y-px';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary:
    'border border-line bg-surface text-ink hover:bg-hover hover:border-line-strong',
  ghost: 'text-ink-secondary hover:bg-hover hover:text-ink',
  danger: 'border border-negative/40 bg-negative-soft text-negative hover:bg-negative/15',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-[13px]',
  lg: 'h-9 px-4 text-sm',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ className, variant = 'secondary', size = 'md', type, ...props }, ref) {
  return (
    <button
      ref={ref}
      // Buttons inside forms default to submit, which has silently submitted
      // more forms than any other HTML default.
      type={type ?? 'button'}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
});

/* ── Badge ────────────────────────────────────────────────────────────── */

type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'caution' | 'info';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'border-line bg-sunken text-ink-secondary',
  accent: 'border-accent-line bg-accent-soft text-accent',
  positive: 'border-positive/30 bg-positive-soft text-positive',
  negative: 'border-negative/30 bg-negative-soft text-negative',
  caution: 'border-caution/30 bg-caution-soft text-caution',
  info: 'border-info/30 bg-info-soft text-info',
};

export function Badge({
  tone = 'neutral',
  mono,
  className,
  children,
  ...props
}: {
  tone?: Tone;
  mono?: boolean;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-xs border px-1.5 py-px text-[10.5px] leading-[1.45] font-medium',
        mono && 'font-mono tracking-tight',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ── Panel ────────────────────────────────────────────────────────────────
   The one container. A titled region with an optional right-hand slot for
   actions, so headers stay consistent across every view. */

export function Panel({
  title,
  subtitle,
  actions,
  flush,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Removes body padding, for tables that supply their own. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line-subtle px-3">
          <div className="flex min-w-0 items-baseline gap-2">
            {title && (
              <h2 className="truncate text-[12.5px] font-semibold tracking-tight text-ink">
                {title}
              </h2>
            )}
            {subtitle && (
              <span className="truncate text-[11px] text-ink-muted">{subtitle}</span>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1 overflow-auto', !flush && 'p-3', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-40 flex-col items-center justify-center px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-line bg-sunken text-ink-faint">
          {icon}
        </div>
      )}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────────────
   A sweep rather than a pulse: it reads as "loading in progress" instead of
   "this element is disabled". */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-sweep rounded-sm bg-sunken', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, transparent 0%, var(--hover) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  );
}

/* ── Tooltip ──────────────────────────────────────────────────────────────
   CSS-only, driven by group-hover and group-focus-within so it appears for
   keyboard users too. The label is also wired through aria-label on the
   trigger by callers, so screen readers never depend on the visual tip. */

export function Tooltip({
  label,
  side = 'top',
  /** `end` right-aligns the tip, for triggers that sit against the viewport
      edge — a centred tip on the last control in the top bar is clipped. */
  align = 'center',
  children,
}: {
  label: ReactNode;
  side?: 'top' | 'right' | 'bottom';
  align?: 'center' | 'end';
  children: ReactNode;
}) {
  const horizontal = align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  const position =
    side === 'right'
      ? 'left-full top-1/2 ml-2 -translate-y-1/2'
      : side === 'bottom'
        ? `top-full mt-2 ${horizontal}`
        : `bottom-full mb-2 ${horizontal}`;

  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-sm border border-line',
          'bg-elevated px-1.5 py-1 text-[11px] font-medium text-ink shadow-md',
          'opacity-0 transition-opacity duration-150',
          'group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          position,
        )}
      >
        {label}
      </span>
    </span>
  );
}

/* ── Keyboard hint ────────────────────────────────────────────────────── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-xs border border-line bg-sunken px-1 py-px font-mono text-[10px] leading-[1.5] text-ink-muted">
      {children}
    </kbd>
  );
}

/* ── Segmented control ────────────────────────────────────────────────────
   Used for the canvas tabs. Implements the tabs pattern properly: one tab
   stop, arrow keys move between options. */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5"
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!delta) return;
        event.preventDefault();
        const index = options.findIndex((option) => option.value === value);
        const next = options[(index + delta + options.length) % options.length];
        onChange(next.value);
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-[12px] font-medium',
              'transition-colors duration-150',
              selected
                ? 'bg-panel text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
