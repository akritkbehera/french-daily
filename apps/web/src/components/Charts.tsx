/**
 * Lightweight hand-rolled SVG charts (no chart dependency).
 * All charts render empty states gracefully and use aria labels.
 */
import React from 'react';
import { shortDateLabel } from '@french-daily/learning-core';

export function BarSeries({
  data,
  label,
  height = 96,
  tone = 'accent',
  suffix = '',
}: {
  data: Array<{ date: string; value: number }>;
  label: string;
  height?: number;
  tone?: 'accent' | 'good';
  suffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const colors = { accent: 'var(--fd-accent)', good: 'var(--fd-good)' } as const;
  return (
    <figure aria-label={label} className="w-full">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
            <div
              className="w-full rounded-t-[5px] transition-all duration-500"
              style={{
                height: `${Math.max(3, (d.value / max) * (height - 22))}px`,
                background: d.value > 0 ? colors[tone] : 'var(--fd-border)',
                opacity: d.value > 0 ? 0.55 + 0.45 * (d.value / max) : 1,
              }}
              title={`${d.value}${suffix}`}
            />
            {i % 2 === 0 && <span className="text-[9px] text-muted">{shortDateLabel(d.date).split(' ')[1]}</span>}
          </div>
        ))}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

export function LineSeries({
  data,
  label,
  height = 96,
}: {
  data: Array<{ date: string; value: number }>;
  label: string;
  height?: number;
}) {
  const w = 300;
  const h = height;
  const max = 100;
  const pts = data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * w;
    const y = h - (Math.min(max, d.value) / max) * (h - 12) - 6;
    return { x, y, ...d };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <figure aria-label={label} className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} role="img">
        <title>{label}</title>
        <line x1="0" y1={h - 6} x2={w} y2={h - 6} stroke="var(--fd-border)" strokeWidth="1" />
        <path d={path} fill="none" stroke="var(--fd-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r="2.6" fill="var(--fd-accent)" />
        ))}
      </svg>
    </figure>
  );
}

export function ProgressRing({
  value,
  max,
  size = 72,
  stroke = 7,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max <= 0 ? 0 : Math.min(1, value / max);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct * 100)}% of goal`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fd-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--fd-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.2,0.9,0.25,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-ink">{children}</div>
    </div>
  );
}
