/** Tiny GitHub sign-in/sync broker. Learning data stays in GitHub, not D1.
 * D1 holds expiring OAuth state and encrypted GitHub credentials only.
 */
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1 { exec(sql: string): Promise<unknown>; prepare(sql: string): Statement }
export interface Store {
  get(key: string): Promise<string | null>;
  take(key: string): Promise<string | null>;
  put(key: string, value: string, expiresAt: number): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface Env {
  APP_URL: string; GITHUB_OWNER: string; GITHUB_REPO: string;
  GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string; DB: D1;
}
export class D1Store implements Store {
  constructor(private database: D1, private now = Date.now) {}
  async initialize() {
    await this.database.exec('CREATE TABLE IF NOT EXISTS auth_records (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)');
    await this.database.prepare('DELETE FROM auth_records WHERE expires < ?').bind(this.now()).run();
  }
  async get(key: string) { return (await this.database.prepare('SELECT value FROM auth_records WHERE key = ? AND expires > ?').bind(key, this.now()).first<{ value: string }>())?.value ?? null; }
  async take(key: string) { return (await this.database.prepare('DELETE FROM auth_records WHERE key = ? AND expires > ? RETURNING value').bind(key, this.now()).first<{ value: string }>())?.value ?? null; }
  async put(key: string, value: string, expiresAt: number) { await this.database.prepare('INSERT OR REPLACE INTO auth_records (key, value, expires) VALUES (?, ?, ?)').bind(key, value, expiresAt).run(); }
  async delete(key: string) { await this.database.prepare('DELETE FROM auth_records WHERE key = ?').bind(key).run(); }
}
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (text: string) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
async function seal(value: unknown, key: string) {
  const imported = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, imported, new TextEncoder().encode(JSON.stringify(value)));
  return `${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}
async function unseal<T>(text: string, key: string): Promise<T> {
  const [iv, ciphertext] = text.split('.');
  const imported = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, imported, decode(ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
interface Tokens { access_token: string; refresh_token?: string; expires_in?: number; expiresAt: number; login: string }
class HTTPError extends Error { constructor(public status: number, message: string) { super(message); } }
const BRANCH = 'progress-data';
const FILE = 'progress.json';
const MAX_BYTES = 8 * 1024 * 1024;

export function createBroker(env: Omit<Env, 'DB'>, store: Store, fetcher: typeof fetch = fetch, now = Date.now) {
  const app = new URL(env.APP_URL);
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': app.origin, Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' } });
  const callback = (req: Request) => `${new URL(req.url).origin}/auth/callback`;
  const redirectBack = (key: string, value: string) => { const url = new URL(app); url.hash = new URLSearchParams({ [key]: value }).toString(); return new Response(null, { status: 302, headers: { Location: url.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); };
  const exchange = async (fields: Record<string, string>): Promise<Tokens> => {
    const response = await fetcher('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000), body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...fields }) });
    const token = await response.json() as Tokens & { error?: string };
    if (!response.ok || token.error || typeof token.access_token !== 'string') throw new HTTPError(401, 'GitHub authorization failed. Please sign in again.');
    return { ...token, expiresAt: now() + (token.expires_in ?? 28800) * 1000 };
  };
  const github = (tokens: Tokens, path: string, init: RequestInit = {}) => fetcher(`https://api.github.com${path}`, { ...init, signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'French-Daily-Sync', ...init.headers, Authorization: `Bearer ${tokens.access_token}` } });
  const authenticate = async (request: Request): Promise<{ tokens: Tokens; key: string }> => {
    const token = request.headers.get('Authorization')?.match(/^Bearer ([\w-]{43})$/)?.[1];
    if (!token) throw new HTTPError(401, 'Sign in with GitHub.');
    const key = `session:${await hash(token)}`;
    const stored = await store.get(key);
    if (!stored) throw new HTTPError(401, 'Session expired.');
    let tokens = await unseal<Tokens>(stored, env.TOKEN_ENCRYPTION_KEY);
    if (tokens.login?.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) throw new HTTPError(403, 'Only the repository owner can sync.');
    if (tokens.expiresAt < now() + 60000) {
      if (!tokens.refresh_token) throw new HTTPError(401, 'Session expired.');
      tokens = { ...await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }), login: tokens.login };
      await store.put(key, await seal(tokens, env.TOKEN_ENCRYPTION_KEY), now() + 30 * 86400000);
    }
    return { tokens, key };
  };
  const repo = `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
  const contentsPath = `${repo}/contents/${FILE}?ref=${BRANCH}`;
  const ensureBranch = async (tokens: Tokens) => {
    const existing = await github(tokens, `${repo}/git/ref/heads/${BRANCH}`);
    if (existing.ok) return;
    if (existing.status !== 404) throw new HTTPError(existing.status, 'Install the GitHub App on this repository with Contents read/write permission.');
    const main = await github(tokens, `${repo}/git/ref/heads/main`);
    if (!main.ok) throw new HTTPError(main.status, 'Could not read the repository.');
    const data = await main.json() as { object: { sha: string } };
    const created = await github(tokens, `${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: data.object.sha }) });
    if (!created.ok && created.status !== 422) throw new HTTPError(created.status, 'Could not create the progress branch.');
  };
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    try {
      if (url.pathname === '/health') return json({ service: 'french-daily-github-sync', configured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY), owner: env.GITHUB_OWNER });
      if (request.method === 'OPTIONS') {
        if (origin !== app.origin) return json({ error: 'Origin not allowed.' }, 403);
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': app.origin, 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' } });
      }
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) throw new HTTPError(503, 'GitHub sign-in needs administrator setup.');
      if (request.method === 'GET' && url.pathname === '/auth/start') {
        const challenge = url.searchParams.get('challenge');
        if (!challenge || !/^[\w-]{43}$/.test(challenge)) throw new HTTPError(400, 'Missing sign-in challenge.');
        const state = random(), verifier = random();
        await store.put(`state:${state}`, JSON.stringify({ challenge, verifier }), now() + 30 * 60000);
        const target = new URL('https://github.com/login/oauth/authorize');
        target.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: callback(request), state, login: env.GITHUB_OWNER, allow_signup: 'false', code_challenge: await hash(verifier), code_challenge_method: 'S256' }).toString();
        return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
      }
      if (request.method === 'GET' && url.pathname === '/auth/callback') {
        const state = url.searchParams.get('state');
        const pending = state && await store.take(`state:${state}`);
        if (!pending || url.searchParams.has('error')) return redirectBack('github_error', 'authorization_failed');
        const { verifier, challenge } = JSON.parse(pending);
        const code = url.searchParams.get('code');
        if (!code) return redirectBack('github_error', 'missing_code');
        const tokens = await exchange({ code, redirect_uri: callback(request), code_verifier: verifier });
        const response = await github(tokens, '/user');
        const user = await response.json() as { login?: string };
        if (!response.ok || user.login?.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) return redirectBack('github_error', 'owner_only');
        tokens.login = user.login!;
        const handoff = random();
        await store.put(`handoff:${await hash(handoff)}`, JSON.stringify({ challenge, tokens: await seal(tokens, env.TOKEN_ENCRYPTION_KEY) }), now() + 180000);
        return redirectBack('github_code', handoff);
      }
      if (origin !== app.origin) throw new HTTPError(403, 'Origin not allowed.');
      if (request.method === 'POST' && url.pathname === '/auth/exchange') {
        const body = await request.json() as { code?: string; verifier?: string };
        if (!body.code || !body.verifier || !/^[\w-]{43}$/.test(body.code) || !/^[\w-]{43}$/.test(body.verifier)) throw new HTTPError(400, 'Invalid sign-in proof.');
        const key = `handoff:${await hash(body.code)}`;
        const found = await store.get(key);
        if (!found || JSON.parse(found).challenge !== await hash(body.verifier)) throw new HTTPError(401, 'Sign-in proof did not match.');
        const consumed = await store.take(key);
        if (!consumed) throw new HTTPError(401, 'Sign-in already completed.');
        const token = random(), expiresAt = now() + 30 * 86400000;
        await store.put(`session:${await hash(token)}`, JSON.parse(consumed).tokens, expiresAt);
        return json({ token, login: env.GITHUB_OWNER, expiresAt });
      }
      const { tokens, key } = await authenticate(request);
      if (url.pathname === '/auth/logout' && request.method === 'DELETE') { await store.delete(key); return json({ ok: true }); }
      if (url.pathname !== '/progress') throw new HTTPError(404, 'Not found.');
      if (request.method === 'GET') {
        await ensureBranch(tokens);
        const response = await github(tokens, contentsPath);
        if (response.status === 404) return json({ sha: null, data: null });
        if (!response.ok) throw new HTTPError(response.status, 'Could not read GitHub progress.');
        const file = await response.json() as { sha: string; content: string; size: number };
        if (file.size > MAX_BYTES) throw new HTTPError(413, 'Progress file is too large to sync. Export a backup before compacting its history.');
        let data: unknown;
        if (file.content) data = JSON.parse(new TextDecoder().decode(decode(file.content.replace(/\s/g, ''))));
        else {
          const raw = await github(tokens, contentsPath, { headers: { Accept: 'application/vnd.github.raw+json' } });
          if (!raw.ok) throw new HTTPError(raw.status, 'Could not download GitHub progress.');
          data = await raw.json();
        }
        return json({ sha: file.sha, data });
      }
      if (request.method === 'PUT') {
        const text = await request.text();
        if (new TextEncoder().encode(text).length > MAX_BYTES) throw new HTTPError(413, 'Progress file exceeds the sync size limit.');
        const body = JSON.parse(text) as { sha?: string | null; data?: { app?: string; syncVersion?: number } };
        if (body.data?.app !== 'french-daily' || body.data.syncVersion !== 1 || (body.sha !== null && typeof body.sha !== 'string')) throw new HTTPError(400, 'Invalid progress snapshot.');
        const encoded = encode(new TextEncoder().encode(JSON.stringify(body.data, null, 2))).replace(/-/g, '+').replace(/_/g, '/');
        const content = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
        const response = await github(tokens, `${repo}/contents/${FILE}`, { method: 'PUT', body: JSON.stringify({ message: 'Sync French Daily progress', branch: BRANCH, ...(body.sha ? { sha: body.sha } : {}), content }) });
        if (response.status === 409 || response.status === 422) throw new HTTPError(409, 'Progress changed on another device. Retry with the latest version.');
        if (!response.ok) throw new HTTPError(response.status, 'GitHub could not save progress. Check the app installation permissions.');
        return json({ ok: true });
      }
      throw new HTTPError(405, 'Method not allowed.');
    } catch (error) {
      if (url.pathname === '/auth/callback') return redirectBack('github_error', 'authorization_failed');
      return json({ error: error instanceof HTTPError ? error.message : 'Request could not be completed.' }, error instanceof HTTPError ? error.status : 500);
    }
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.DB) return new Response('Authentication storage has not been configured.', { status: 503 });
    const store = new D1Store(env.DB); await store.initialize();
    return createBroker(env, store)(request);
  },
};
