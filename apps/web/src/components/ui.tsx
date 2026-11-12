/**
 * Small UI primitives with an Apple-like visual language:
 * restrained surfaces, soft shadows, generous spacing, clear hierarchy.
 */
import React from 'react';

export function Card({
  children,
  className = '',
  onClick,
  interactive = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-surface border border-edge shadow-[var(--fd-shadow)] ${
        interactive ? 'cursor-pointer active:scale-[0.985] transition-transform' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'good' | 'bad' | 'danger';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-white shadow-[0_6px_18px_var(--fd-accent-soft)] hover:opacity-92',
    secondary: 'bg-surface2 text-ink border border-edge hover:opacity-90',
    ghost: 'bg-transparent text-accent hover:bg-accentsoft',
    good: 'bg-goodsoft text-good border border-good/30',
    bad: 'bg-badsoft text-bad border border-bad/30',
    danger: 'bg-bad text-white hover:opacity-90',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold transition
        active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  active = false,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition border ${
        active
          ? 'bg-accent text-white border-transparent'
          : 'bg-surface text-muted border-edge hover:text-ink'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'accent';
}) {
  const tones = {
    neutral: 'bg-surface2 text-muted',
    good: 'bg-goodsoft text-good',
    bad: 'bg-badsoft text-bad',
    warn: 'bg-warn/12 text-warn',
    accent: 'bg-accentsoft text-accent',
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-ink">{label}</div>
        {description && <div className="text-[13px] text-muted leading-snug">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface2 border border-edge'
        } disabled:opacity-40`}
      >
        <span
          className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[23px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex rounded-xl bg-surface2 p-1 border border-edge" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'neutral' | 'good' | 'bad' | 'accent';
}) {
  const tones = {
    neutral: 'text-ink',
    good: 'text-good',
    bad: 'text-bad',
    accent: 'text-accent',
  } as const;
  return (
    <div className="rounded-2xl bg-surface border border-edge p-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">{label}</div>
      <div className={`mt-1 text-[26px] leading-tight font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-[12px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'good' | 'warn' }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const colors = { accent: 'bg-accent', good: 'bg-good', warn: 'bg-warn' } as const;
  return (
    <div className="h-2 rounded-full bg-surface2 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full transition-all duration-500 ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <h2 className="text-[17px] font-bold text-ink tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

export function Screen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-3xl px-5 pt-6 pb-28 md:pb-10 ${className}`}>{children}</div>
  );
}
