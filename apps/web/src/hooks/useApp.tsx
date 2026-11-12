/**
 * App-level state: settings, theme, navigation, session launching, toasts.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, SessionConfig } from '@french-daily/learning-core';
import { defaultSessionConfig, customSessionConfig } from '@french-daily/learning-core';
import { getSettings, saveSettings } from '../storage/repos';

export type View = 'today' | 'nouns' | 'verbs' | 'practice' | 'review' | 'progress' | 'settings';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface AppState {
  settings: AppSettings | null;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  view: View;
  navigate: (view: View) => void;
  sessionConfig: SessionConfig | null;
  startDailySession: () => void;
  startSession: (config: SessionConfig) => void;
  startReviewSession: (size: 'short' | 'standard' | 'long') => void;
  endSession: () => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppState | null>(null);

const VIEW_TITLES: Record<View, string> = {
  today: 'Today',
  nouns: 'Nouns',
  verbs: 'Verbs',
  practice: 'Practice',
  review: 'Review',
  progress: 'Progress',
  settings: 'Settings',
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<View>(() => initialView());
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  // Theme: explicit choice or system preference.
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const apply = () => {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', dark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0c0c0f' : '#4f46e5');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings?.theme]);

  // Keep the document title in sync with the current view.
  useEffect(() => {
    document.title = `${VIEW_TITLES[view]} · French Daily`;
  }, [view]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
  }, []);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const value = useMemo<AppState>(
    () => ({
      settings,
      updateSettings,
      view,
      navigate: setView,
      sessionConfig,
      startDailySession: () => {
        setSessionConfig(defaultSessionConfig(settings?.sessionSize ?? 'standard'));
      },
      startSession: (config) => setSessionConfig(config),
      startReviewSession: (size) =>
        setSessionConfig(customSessionConfig({ mode: 'review', size })),
      endSession: () => setSessionConfig(null),
      toast,
      toasts,
      dismissToast,
    }),
    [settings, updateSettings, view, sessionConfig, toast, toasts, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function initialView(): View {
  if (typeof window === 'undefined') return 'today';
  const fromQuery = new URLSearchParams(window.location.search).get('view');
  const valid: View[] = ['today', 'nouns', 'verbs', 'practice', 'review', 'progress', 'settings'];
  return (valid.find((v) => v === fromQuery) as View) ?? 'today';
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
