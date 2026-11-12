/**
 * Navigation: bottom tab bar on mobile, sidebar on desktop.
 */
import React from 'react';
import type { View } from '../hooks/useApp';

const ITEMS: Array<{ view: View; label: string; icon: React.ReactNode }> = [
  {
    view: 'today',
    label: 'Today',
    icon: (
      <path d="M12 3l9 7h-3v9h-5v-6h-2v6H6v-9H3l9-7z" />
    ),
  },
  {
    view: 'nouns',
    label: 'Nouns',
    icon: (
      <path d="M6 3h9a3 3 0 013 3v15l-4-2-4 2-4-2-4 2V6a3 3 0 013-3zm2 5h8M8 12h8M8 16h5" />
    ),
  },
  {
    view: 'verbs',
    label: 'Verbs',
    icon: (
      <path d="M5 4h14v3H5zM5 10h14M5 14h9M5 18h6" />
    ),
  },
  {
    view: 'practice',
    label: 'Practice',
    icon: (
      <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-4l4-4m0 0l-1.5-1.5M16 13l-1.5 1.5M12 7v5l3 2" />
    ),
  },
  {
    view: 'review',
    label: 'Review',
    icon: (
      <path d="M4 12a8 8 0 0113.7-5.7L20 8m0 0V4m0 4h-4M20 12a8 8 0 01-13.7 5.7L4 16m0 0v4m0-4h4" />
    ),
  },
  {
    view: 'progress',
    label: 'Progress',
    icon: (
      <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />
    ),
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: (
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 00-2-1.2L14.6 3h-4l-.4 2.6a7.5 7.5 0 00-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 000 2.5l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 002 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 002-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" />
    ),
  },
];

export function Nav({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (v: View) => void;
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <nav
        aria-label="Main navigation"
        className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 flex-col gap-1 border-r border-edge bg-surface px-4 py-6 z-40"
      >
        <div className="px-3 pb-6">
          <div className="text-[19px] font-bold tracking-[-0.02em] text-ink">
            French<span className="text-accent"> Daily</span>
          </div>
          <div className="text-[12px] text-muted mt-0.5">Learn a little every day</div>
        </div>
        {ITEMS.map((item) => {
          const active = item.view === view;
          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                active ? 'bg-accentsoft text-accent' : 'text-muted hover:text-ink hover:bg-surface2'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {item.icon}
              </svg>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Main navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-edge bg-surface/95 backdrop-blur-xl safe-bottom"
      >
        <ul className="flex">
          {ITEMS.map((item) => {
            const active = item.view === view;
            return (
              <li key={item.view} className="flex-1">
                <button
                  onClick={() => onNavigate(item.view)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  className={`flex w-full flex-col items-center gap-0.5 pt-2 pb-1 transition ${
                    active ? 'text-accent' : 'text-muted'
                  }`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
                    {item.icon}
                  </svg>
                  <span className="text-[9.5px] font-semibold tracking-tight">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
