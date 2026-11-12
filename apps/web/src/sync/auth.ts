export interface GitHubSession { token: string; login: string; expiresAt: number }
export const OWNER = import.meta.env.VITE_REPOSITORY_OWNER || 'akritkbehera';
export const AUTH_URL = (import.meta.env.VITE_GITHUB_AUTH_URL || '').replace(/\/$/, '');
const KEY = 'french-daily-github-auth';
const PENDING = 'french-daily-github-pending';
export const AUTH_CHANGED = 'french-daily:auth-changed';
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function getGitHubSession(): GitHubSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return value && typeof value.token === 'string' && value.login?.toLowerCase() === OWNER.toLowerCase() && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() ? value : null;
  } catch { return null; }
}
export function clearGitHubSession() { localStorage.removeItem(KEY); window.dispatchEvent(new Event(AUTH_CHANGED)); }
export async function loginWithGitHub() {
  if (!AUTH_URL) throw new Error('GitHub sign-in has not been configured yet.');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, createdAt: Date.now() }));
  const url = new URL(`${AUTH_URL}/auth/start`); url.searchParams.set('challenge', challenge);
  window.location.assign(url.href);
}
export async function completeGitHubLogin(fetcher: typeof fetch = fetch): Promise<boolean> {
  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get('github_code');
  const error = params.get('github_error');
  if (!code && !error) return false;
  history.replaceState(null, '', location.pathname + location.search);
  const pendingRaw = sessionStorage.getItem(PENDING); sessionStorage.removeItem(PENDING);
  if (error) throw new Error('GitHub sign-in was cancelled or could not be completed.');
  const pending = JSON.parse(pendingRaw ?? 'null');
  if (!AUTH_URL || !pending || typeof pending.verifier !== 'string' || Date.now() - pending.createdAt > 30 * 60000) throw new Error('This sign-in expired. Please sign in again.');
  const response = await fetcher(`${AUTH_URL}/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ code, verifier: pending.verifier }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Could not finish GitHub sign-in. Please try again.');
  const session = await response.json() as GitHubSession;
  if (session.login?.toLowerCase() !== OWNER.toLowerCase() || typeof session.token !== 'string' || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw new Error('Only the repository owner can sync this app.');
  localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(AUTH_CHANGED));
  return true;
}
export async function brokerRequest(path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const session = getGitHubSession();
  if (!session || !AUTH_URL) throw new Error('Sign in with GitHub to sync your progress.');
  const response = await fetcher(`${AUTH_URL}${path}`, { ...init, credentials: 'omit', headers: { ...init.headers, Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(30000) });
  if (response.status === 401) { clearGitHubSession(); throw new Error('Your GitHub session expired. Your progress is safe on this device; sign in to sync.'); }
  return response;
}

export async function logoutGitHub() {
  try { if (getGitHubSession() && AUTH_URL) await brokerRequest('/auth/logout', { method: 'DELETE' }); }
  finally { clearGitHubSession(); }
}
