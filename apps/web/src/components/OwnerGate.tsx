import { useState, type FormEvent, type ReactNode } from 'react';

export const REPOSITORY_OWNER = import.meta.env.VITE_REPOSITORY_OWNER || 'akritkbehera';
const ACCESS_KEY = 'french-daily-owner-session';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function hasOwnerSession(): boolean {
  try {
    const session = JSON.parse(sessionStorage.getItem(ACCESS_KEY) ?? 'null');
    return session?.login?.toLowerCase() === REPOSITORY_OWNER.toLowerCase() &&
      Number.isFinite(session.verifiedAt) && session.verifiedAt <= Date.now() && Date.now() - session.verifiedAt < MAX_AGE;
  } catch { return false; }
}

export async function verifyOwner(token: string, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json' },
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('GitHub could not verify that token. Check it and try again.');
  const user = await response.json() as { login?: string };
  if (typeof user.login !== 'string' || user.login.toLowerCase() !== REPOSITORY_OWNER.toLowerCase()) throw new Error(`This personal app is for @${REPOSITORY_OWNER}. That token belongs to another account.`);
  return user.login;
}

export function OwnerGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(hasOwnerSession);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !token.trim()) return;
    setBusy(true); setError('');
    try {
      const login = await verifyOwner(token);
      sessionStorage.setItem(ACCESS_KEY, JSON.stringify({ login, verifiedAt: Date.now() }));
      setToken(''); setUnlocked(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Connect to the internet to verify your GitHub account.'); }
    finally { setToken(''); setBusy(false); }
  };
  if (unlocked) return <>
    <div className="fixed top-2 right-3 z-[80] flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1 text-[12px] text-muted">
      <span>@{REPOSITORY_OWNER}</span>
      <button className="font-semibold text-accent" onClick={() => { sessionStorage.removeItem(ACCESS_KEY); setUnlocked(false); }}>Lock</button>
    </div>
    {children}
  </>;
  return <main className="min-h-screen flex items-center justify-center bg-bg p-6">
    <form onSubmit={unlock} className="w-full max-w-md rounded-3xl border border-edge bg-surface p-7 shadow-lg">
      <p className="text-sm font-semibold text-accent">French Daily · Personal edition</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">Bienvenue, {REPOSITORY_OWNER}</h1>
      <p className="mt-3 text-sm text-muted">Verify your GitHub account to open your practice space. Only the repository owner can unlock this interface.</p>
      <label className="mt-6 block text-sm font-semibold text-ink" htmlFor="owner-token">GitHub personal access token</label>
      <input id="owner-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={e => setToken(e.target.value)} className="mt-2 w-full rounded-xl border border-edge bg-bg p-3 text-ink" />
      <p className="mt-2 text-xs text-muted">Use a fine-grained token with no repository or account permissions. It goes directly to GitHub to verify your identity and is never saved. This tab stays unlocked for up to seven days, including offline reloads.</p>
      <a className="mt-3 inline-block text-sm text-accent underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create a minimal GitHub token</a>
      {error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}
      <button disabled={busy || !token.trim()} className="mt-5 w-full rounded-xl bg-accent p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Unlock my practice'}</button>
      <p className="mt-4 text-xs text-muted">Progress stays on this device. This is a personal interface lock; the app’s public GitHub Pages files remain downloadable.</p>
    </form>
  </main>;
}
