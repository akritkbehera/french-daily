#!/usr/bin/env node
/** Run on your computer once. GitHub credentials stay in memory and are piped
 * directly to Worker secrets, never printed or written to the checkout. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const directory = path.join(root, 'packages/auth-broker');
const owner = 'akritkbehera', repository = `${owner}/french-daily`;
const appUrl = `https://${owner}.github.io/french-daily/`;
const checkpointPath = path.join(directory, '.setup-state.json');
const configPath = path.join(directory, 'wrangler.local.json');
let checkpoint;
try { checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')); } catch { checkpoint = {}; }
if (checkpoint.complete) { console.log(`GitHub sync is already configured: ${checkpoint.workerUrl}`); process.exit(0); }
if (checkpoint.appRegistered) throw new Error('A GitHub App was already registered in a previous attempt. Resume from that app in GitHub/Cloudflare settings; do not create duplicate registrations. See docs/github-sync.md.');

function run(command, args, { cwd = root, capture = false, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'] });
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; });
    if (input !== undefined) child.stdin.end(input);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`${command} ${args[0]} failed (exit ${code}).`)));
  });
}
const wrangler = (args, options = {}) => run('npx', ['--yes', 'wrangler@4', ...args], { cwd: directory, ...options });
const saveCheckpoint = () => writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
const openBrowser = url => {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  spawn(command, args, { stdio: 'ignore' }).once('error', () => console.log(`Open this URL: ${url}`));
};
const login = (await run('gh', ['api', 'user', '--jq', '.login'], { capture: true })).trim();
if (login.toLowerCase() !== owner) throw new Error(`Run gh auth login as ${owner} before setup.`);
console.log('Sign in to Cloudflare when prompted. This deploys a small authentication Worker and a D1 credential store; learning progress is stored in GitHub.');
try { const who = await wrangler(['whoami'], { capture: true }); if (/not authenticated|not logged/i.test(who)) await wrangler(['login']); } catch { await wrangler(['login']); }
await run('npm', ['run', 'build:packages']);
if (!checkpoint.databaseId) {
  const databaseName = `french-daily-auth-${Date.now().toString(36)}`;
  const output = await wrangler(['d1', 'create', databaseName], { capture: true });
  const databaseId = output.match(/"database_id"\s*:\s*"([a-f0-9-]{36})"/i)?.[1] ?? output.match(/database_id\s*=\s*"([a-f0-9-]{36})"/i)?.[1];
  if (!databaseId) throw new Error('Could not read the created D1 ID. Use the Cloudflare dashboard to find it and follow docs/github-sync.md.');
  checkpoint = { ...checkpoint, databaseId, databaseName }; await saveCheckpoint();
}
await writeFile(configPath, JSON.stringify({ name: 'french-daily-github-auth', main: 'dist/index.js', compatibility_date: '2026-11-12', vars: { APP_URL: appUrl, GITHUB_OWNER: owner, GITHUB_REPO: 'french-daily' }, d1_databases: [{ binding: 'DB', database_name: checkpoint.databaseName, database_id: checkpoint.databaseId }] }, null, 2));
const deployment = await wrangler(['deploy', '--config', configPath], { capture: true });
const workerUrl = deployment.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/gi)?.at(-1);
if (!workerUrl) throw new Error('Could not read the deployed Worker URL. Check Cloudflare and follow docs/github-sync.md.');
checkpoint.workerUrl = workerUrl; await saveCheckpoint();

// GitHub's manifest flow registers a preconfigured App in the user's browser.
const state = randomBytes(24).toString('hex');
let resolveRegistration, rejectRegistration;
const registered = new Promise((resolve, reject) => { resolveRegistration = resolve; rejectRegistration = reject; });
const escapeHtml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (url.pathname === '/registered') {
    if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) { response.writeHead(400); response.end('Registration state did not match.'); return; }
    try {
      const conversion = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(url.searchParams.get('code'))}/conversions`, { method: 'POST', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'French-Daily-Setup' } });
      if (!conversion.ok) throw new Error(`GitHub manifest conversion failed (${conversion.status}).`);
      const app = await conversion.json();
      checkpoint.appRegistered = true; checkpoint.appUrl = app.html_url; checkpoint.clientId = app.client_id; await saveCheckpoint();
      response.end('GitHub App registered. Return to your terminal to finish setup.'); resolveRegistration(app);
    } catch (error) { response.writeHead(500); response.end('Registration failed. Return to your terminal.'); rejectRegistration(error); }
    return;
  }
  if (url.pathname !== '/') { response.writeHead(404); response.end(); return; }
  const address = server.address();
  const manifest = { name: `French Daily ${state.slice(0, 8)}`, url: appUrl, redirect_url: `http://127.0.0.1:${address.port}/registered?state=${state}`, callback_urls: [`${workerUrl}/auth/callback`], public: false, default_permissions: { contents: 'write' }, default_events: [], hook_attributes: { url: appUrl, active: false } };
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Connect French Daily</title><body style="font:18px system-ui;max-width:600px;margin:60px auto;padding:24px"><h1>Connect French Daily to GitHub</h1><p>Create your personal GitHub App, then install it only on ${repository}. It needs Contents read/write to save progress.json.</p><form action="https://github.com/settings/apps/new" method="post"><input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}"><button style="font:inherit;padding:16px">Create GitHub connection</button></form></body>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const localUrl = `http://127.0.0.1:${server.address().port}/`;
console.log(`Open ${localUrl} to register the GitHub App.`); openBrowser(localUrl);
let app;
try { app = await registered; } finally { server.close(); }
if (!app.client_id || !app.client_secret || !app.html_url) throw new Error('GitHub did not return the expected app credentials.');
// The manifest also generates a PEM private key. This user-token flow does not
// use it; do not save it or ship it to the Worker or frontend.
await wrangler(['secret', 'bulk', '--config', configPath], { input: JSON.stringify({ GITHUB_CLIENT_ID: app.client_id, GITHUB_CLIENT_SECRET: app.client_secret, TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64') }) });
console.log(`Install the app ONLY on ${repository}: ${app.html_url}/installations/new`);
openBrowser(`${app.html_url}/installations/new`);
const prompt = createInterface({ input: process.stdin, output: process.stdout });
await prompt.question('After installing it on french-daily, press Enter to activate sync: '); prompt.close();
await run('gh', ['variable', 'set', 'FRENCH_DAILY_AUTH_URL', '--repo', repository, '--body', workerUrl]);
await run('gh', ['workflow', 'run', 'deploy.yml', '--repo', repository, '--ref', 'main']);
checkpoint.complete = true; await saveCheckpoint();
console.log(`Connected. After GitHub Pages finishes deploying, open ${appUrl} and choose Continue with GitHub. No manual tokens are needed.`);
