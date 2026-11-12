import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTH_CHANGED, AUTH_URL, OWNER, logoutGitHub, getGitHubSession, loginWithGitHub } from '../sync/auth';
import { SESSION_SAVED } from '../sync/events';
import { syncProgress } from '../sync/service';
import { useApp } from '../hooks/useApp';

export function SyncControl() {
  const { toast } = useApp();
  const [session, setSession] = useState(getGitHubSession);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const auto = useRef(false);
  const sync = useCallback(async () => {
    if (!getGitHubSession()) { setStatus('Sign in to sync'); return; }
    if (!navigator.onLine) { setStatus('Offline · sync pending'); return; }
    setBusy(true); setStatus('Syncing…');
    try { await syncProgress(); setStatus('Synced just now'); }
    catch (err) { const message = err instanceof Error ? err.message : 'Sync failed. Your progress is safe on this device.'; setStatus('Sync pending'); toast(message, 'error'); }
    finally { setBusy(false); }
  }, [toast]);
  useEffect(() => {
    const changed = () => { setSession(getGitHubSession()); auto.current = false; };
    const completed = () => { void sync(); };
    window.addEventListener(AUTH_CHANGED, changed);
    window.addEventListener(SESSION_SAVED, completed);
    window.addEventListener('online', completed);
    return () => { window.removeEventListener(AUTH_CHANGED, changed); window.removeEventListener(SESSION_SAVED, completed); window.removeEventListener('online', completed); };
  }, [sync]);
  useEffect(() => { if (session && !auto.current) { auto.current = true; void sync(); } }, [session, sync]);
  return <div className="fixed top-2 right-3 z-[80] flex max-w-[300px] items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1 text-[12px] text-muted shadow-sm">
    <span role="status" className="truncate">{status || (session ? `@${OWNER}` : 'On this device')}</span>
    {session ? <>
      <button disabled={busy} className="font-semibold text-accent disabled:opacity-50" onClick={() => void sync()}>{busy ? 'Syncing…' : 'Sync'}</button>
      <button className="font-semibold" onClick={() => { void logoutGitHub().catch(() => undefined); setStatus('On this device'); }}>Sign out</button>
    </> : <button disabled={!AUTH_URL} className="font-semibold text-accent disabled:opacity-50" onClick={() => void loginWithGitHub().catch(err => toast(String(err), 'error'))}>{AUTH_URL ? 'Sign in' : 'Sync not connected'}</button>}
  </div>;
}
