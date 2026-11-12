import { useEffect, useState, type ReactNode } from 'react';
import { AUTH_CHANGED, AUTH_URL, OWNER, completeGitHubLogin, getGitHubSession, loginWithGitHub } from '../sync/auth';

export const REPOSITORY_OWNER = OWNER;
export function OwnerGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!location.hash.includes('github_'));
  const [session, setSession] = useState(getGitHubSession);
  const [error, setError] = useState('');
  const [local, setLocal] = useState(() => sessionStorage.getItem('french-daily-local-mode') === 'yes');
  useEffect(() => {
    const changed = () => setSession(getGitHubSession());
    window.addEventListener(AUTH_CHANGED, changed);
    void completeGitHubLogin().catch(err => setError(err instanceof Error ? err.message : 'Sign-in failed.')).finally(() => { changed(); setReady(true); });
    return () => window.removeEventListener(AUTH_CHANGED, changed);
  }, []);
  if (!ready) return <main className="min-h-screen flex items-center justify-center text-muted">Finishing GitHub sign-in…</main>;
  if (session || local) return <>{children}</>;
  return <main className="min-h-screen flex items-center justify-center bg-bg p-6">
    <section className="w-full max-w-md rounded-3xl border border-edge bg-surface p-7 shadow-lg">
      <p className="text-sm font-semibold text-accent">French Daily</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">Your French, on every device</h1>
      <p className="mt-3 text-sm text-muted">Sign in as @{OWNER} to sync your progress with your GitHub repository.</p>
      {error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}
      <button disabled={!AUTH_URL} onClick={() => void loginWithGitHub().catch(err => setError(String(err)))} className="mt-6 w-full rounded-xl bg-accent p-3 font-semibold text-white disabled:opacity-50">Continue with GitHub</button>
      {!AUTH_URL && <p className="mt-3 text-sm text-muted">GitHub sync needs a one-time connection setup. You can practice on this device in the meantime.</p>}
      <button className="mt-3 w-full rounded-xl border border-edge p-3 text-sm font-semibold text-muted" onClick={() => { sessionStorage.setItem('french-daily-local-mode', 'yes'); setLocal(true); }}>Continue on this device</button>
      <p className="mt-4 text-xs text-muted">Reviews save offline first. Connected devices sync after sessions, or whenever you press Sync. The progress JSON in your repository is public.</p>
    </section>
  </main>;
}
