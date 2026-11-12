/**
 * App shell — navigation, screen switching, session overlay, toasts,
 * keyboard shortcuts and the update prompt.
 */
import { useEffect } from 'react';
import { AppProvider, useApp } from './hooks/useApp';
import { Nav } from './components/Nav';
import { SessionRunner } from './components/SessionRunner';
import { TodayScreen } from './screens/TodayScreen';
import { NounsScreen } from './screens/NounsScreen';
import { VerbsScreen } from './screens/VerbsScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';

function Shell() {
  const { view, navigate, sessionConfig, endSession, startDailySession, toasts, dismissToast } = useApp();

  // Global keyboard shortcuts (documented in README):
  // 1-7 jump to screens, "p" starts practice, Escape closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const views = ['today', 'nouns', 'verbs', 'practice', 'review', 'progress', 'settings'] as const;
      const num = Number(e.key);
      if (num >= 1 && num <= views.length) {
        navigate(views[num - 1]);
      } else if (e.key === 'p') {
        navigate('practice');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <Nav view={view} onNavigate={navigate} />

      <main className="md:pl-60">
        {view === 'today' && <TodayScreen />}
        {view === 'nouns' && <NounsScreen />}
        {view === 'verbs' && <VerbsScreen />}
        {view === 'practice' && <PracticeScreen />}
        {view === 'review' && <ReviewScreen />}
        {view === 'progress' && <ProgressScreen />}
        {view === 'settings' && <SettingsScreen />}
      </main>

      {/* Session overlay */}
      {sessionConfig && (
        <SessionRunner
          config={sessionConfig}
          onClose={endSession}
          onStartAnother={() => {
            endSession();
            startDailySession();
          }}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-24 md:bottom-6 right-4 z-[70] flex flex-col gap-2 max-w-[320px]">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={`anim-slide-up rounded-2xl px-4 py-3 text-[13.5px] font-medium shadow-[var(--fd-shadow)] text-left border ${
              t.tone === 'success'
                ? 'bg-goodsoft border-good/30 text-good'
                : t.tone === 'error'
                  ? 'bg-badsoft border-bad/30 text-bad'
                  : 'bg-surface border-edge text-ink'
            }`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
