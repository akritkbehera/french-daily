import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createBroker, type Store } from './index';
const APP = 'https://akritkbehera.github.io';
const env = { APP_URL: `${APP}/french-daily/`, GITHUB_OWNER: 'akritkbehera', GITHUB_REPO: 'french-daily', GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-client-secret', TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') };
class MemoryStore implements Store {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async take(key: string) { const value = await this.get(key); this.data.delete(key); return value; }
  async put(key: string, value: string) { this.data.set(key, value); }
  async delete(key: string) { this.data.delete(key); }
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function signIn(login = 'akritkbehera') {
  const store = new MemoryStore();
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes('/login/oauth/access_token')) return Response.json({ access_token: 'test-github-access', refresh_token: 'test-github-refresh', expires_in: 28800 });
    if (url.endsWith('/user')) return Response.json({ login });
    if (url.includes('/git/ref/heads/progress-data')) return Response.json({ object: { sha: 'branch' } });
    if (url.includes('/contents/progress.json') && init?.method === 'PUT') return Response.json({ message: 'conflict' }, { status: 409 });
    if (url.includes('/contents/progress.json')) return new Response('{}', { status: 404 });
    throw new Error(`Unexpected GitHub URL: ${url}`);
  });
  const handler = createBroker(env, store, mock);
  const verifier = 'v'.repeat(43);
  const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', Buffer.from(verifier))).toString('base64url');
  const start = await handler(new Request(`https://auth.example/auth/start?challenge=${digest}`));
  const authorize = new URL(start.headers.get('location')!);
  const state = authorize.searchParams.get('state');
  const callback = await handler(new Request(`https://auth.example/auth/callback?state=${state}&code=test-code`));
  return { handler, store, mock, verifier, authorize, callback };
}
it('uses GitHub PKCE, verifies the owner and exchanges a one-use handoff without exposing GitHub credentials', async () => {
  const { handler, store, verifier, authorize, callback } = await signIn();
  expect(authorize.origin).toBe('https://github.com'); expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
  const back = new URL(callback.headers.get('location')!); const code = new URLSearchParams(back.hash.slice(1)).get('github_code');
  expect(back.origin).toBe(APP); expect(back.href).not.toContain('test-github-access');
  expect(JSON.stringify([...store.data.values()])).not.toContain('test-github-access');
  const request = () => new Request('https://auth.example/auth/exchange', { method: 'POST', headers: { Origin: APP, 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }) });
  const result = await handler(request()); const session = await result.json();
  expect(result.status).toBe(200); expect(session.login).toBe('akritkbehera'); expect(session.token).not.toBe('test-github-access');
  expect((await handler(request())).status).toBe(401);
});
it('rejects a different GitHub account', async () => {
  const { callback, store } = await signIn('someone-else');
  expect(callback.headers.get('location')).toContain('github_error=owner_only');
  expect([...store.data.keys()].some(key => key.startsWith('handoff:'))).toBe(false);
});
it('rejects a wrong browser verifier without consuming the real handoff', async () => {
  const { handler, callback, verifier } = await signIn();
  const code = new URLSearchParams(new URL(callback.headers.get('location')!).hash.slice(1)).get('github_code');
  const exchange = (value: string) => handler(new Request('https://auth.example/auth/exchange', { method: 'POST', headers: { Origin: APP }, body: JSON.stringify({ code, verifier: value }) }));
  expect((await exchange('x'.repeat(43))).status).toBe(401);
  expect((await exchange(verifier)).status).toBe(200);
});
it('requires authenticated owner requests and rejects other origins', async () => {
  const { handler, callback, verifier } = await signIn();
  expect((await handler(new Request('https://auth.example/progress', { headers: { Origin: APP } }))).status).toBe(401);
  const code = new URLSearchParams(new URL(callback.headers.get('location')!).hash.slice(1)).get('github_code');
  const auth = await handler(new Request('https://auth.example/auth/exchange', { method: 'POST', headers: { Origin: APP }, body: JSON.stringify({ code, verifier }) }));
  const { token } = await auth.json();
  const headers = { Origin: APP, Authorization: `Bearer ${token}` };
  expect(await (await handler(new Request('https://auth.example/progress', { headers }))).json()).toEqual({ sha: null, data: null });
  expect((await handler(new Request('https://auth.example/progress', { headers: { ...headers, Origin: 'https://evil.example' } }))).status).toBe(403);
  const put = await handler(new Request('https://auth.example/progress', { method: 'PUT', headers, body: JSON.stringify({ sha: 'old', data: { app: 'french-daily', syncVersion: 1 } }) }));
  expect(put.status).toBe(409);
  expect((await handler(new Request('https://auth.example/auth/logout', { method: 'DELETE', headers }))).status).toBe(200);
  expect((await handler(new Request('https://auth.example/progress', { headers }))).status).toBe(401);
});
it('rejects unknown callback state without contacting GitHub', async () => {
  const { handler, mock } = await signIn(); const count = mock.mock.calls.length;
  const result = await handler(new Request('https://auth.example/auth/callback?state=unknown&code=bad'));
  expect(result.headers.get('location')).toContain('github_error'); expect(mock.mock.calls.length).toBe(count);
});
