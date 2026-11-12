# French Daily

**A local-first French learning PWA.** Short daily sessions, a premium swipe-card drill, FSRS spaced repetition, honest progress metrics — everything runs in your browser and nothing ever leaves your device.

**Live app:** https://akritkbehera.github.io/french-daily/

---

## What it is

French Daily is a French A1–B1 practice app built around three evidence-informed ideas (see [`docs/engagement-research.md`](docs/engagement-research.md) for the research and its confidence levels):

1. **Feedback with explanations is the learning keystone.** Every answer — right or wrong — gets the correct form *and* the grammar note, with optional pronunciation playback.
2. **Reviews should come when you're about to forget, not on a fixed loop.** Scheduling is FSRS-4.5, an open-source algorithm with measurably better recall prediction than classic SM-2.
3. **Engagement should never be manipulation.** Sessions are finite and finishable, streaks are optional and never shame you, and there are no loot boxes, leaderboards, or guilt notifications. Learning metrics and engagement metrics are shown separately and never conflated.

## Features

- **7 screens** — Today (daily plan + challenges), Nouns, Verbs, Practice, Review, Progress, Settings. Mobile bottom navigation, desktop sidebar.
- **300+ curated nouns** with gender, articles, elision and plural metadata (validated at build time), **60+ verbs** with full present-tense tables (including être, avoir, aller, faire, se lever, commencer…), **50+ sentence pairs** with curated alternative translations and grammar notes.
- **7 exercise kinds** — typed translation, multiple choice, fill-the-verb, direct conjugation, word order, sentence construction, gender select. Grading is fully deterministic and distinguishes *accent mistakes*, *missing articles*, *typos* and *real errors* — with retries, never the same item twice in a row.
- **Swipe recall deck** — reveal first, then swipe honestly ("knew it" / "didn't"). Spring physics, keyboard support (Space/←/→), one-tap **undo that restores the previous FSRS state**, and thresholds that prevent accidental grading.
- **FSRS-4.5 scheduling** — per-item stability, difficulty, interval, lapse history, estimated retrievability. Ratings map from grading outcomes (correct → Good, accent/typo → Hard, wrong/article → Again).
- **Finite sessions** with an honest completion summary (5 nouns + 5 verbs + 5 sentences by default). Partial sessions never count toward streaks or stats.
- **Optional gamification** — daily challenges generated from your real weak spots, milestones for genuine learning outcomes, forgiving streaks (never resets with shame), all individually toggleable.
- **PWA** — installable, fully offline after first load (Workbox precache), light/dark/system themes, `prefers-reduced-motion` honored, keyboard shortcuts (1–7 jump to screens).
- **Your data is yours** — IndexedDB storage, JSON export/import/reset, no accounts, no servers, no telemetry.
- **MCP server** — the whole learning engine exposed as 8 tools for AI assistants (lookup, conjugation, exercise generation, grading, FSRS scheduling, progress stats).

## Quick start

```bash
npm install
npm run dev          # dev server for the web app
npm run check        # lint + typecheck + unit tests + production build
npm run test:e2e     # Playwright across 4 viewports (starts a preview server)
```

Generate PWA icons (only needed after changing `scripts/generate-icons.mjs`):

```bash
npm run icons
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for `apps/web` |
| `npm run build` | Build the MCP server bundle + the web app (PWA) |
| `npm run build:web` | Production build of the web app (base path `/french-daily/`) |
| `npm run preview` | Serve the production build locally |
| `npm test` | Vitest unit tests (engine, data, storage, UI) |
| `npm run test:e2e` | Playwright e2e (Chromium at 375×812, 390×844, 768×1024, 1440×900) |
| `npm run lint` / `npm run typecheck` | ESLint (flat config) / TypeScript |
| `npm run check` | Everything: lint → typecheck → test → build |
| `npm run icons` | Regenerate PWA icons from SVG source |

## Repository layout

```
apps/web/                  React + TypeScript + Vite + Tailwind PWA (Dexie/IndexedDB)
packages/learning-core/    Pure TS learning engine: grading, FSRS, sessions, metrics
packages/french-data/      Curated French content with fail-fast validation
packages/mcp-server/       MCP server (stdio) exposing the engine as 8 tools
e2e/                       Playwright specs
docs/                      Architecture, engine, data model, testing, deployment, roadmap…
```

Consumed packages are compiled from TypeScript source via workspace aliases — no build step needed for `learning-core` / `french-data` in the web app.

## Using the MCP server

The repo ships an [MCP](https://modelcontextprotocol.io) server so AI coding assistants can look up words, conjugate verbs, generate and grade exercises, compute FSRS schedules, and summarize progress files. An `opencode.json` at the repo root registers it with OpenCode:

```json
{
  "mcp": {
    "french-daily": {
      "type": "local",
      "command": ["node", "packages/mcp-server/dist/index.js"],
      "enabled": true
    }
  }
}
```

Build it first (`npm run build:packages`), then any MCP client that speaks stdio can use the 8 tools (`lookup_word`, `lookup_verb`, `conjugate`, `generate_exercise`, `grade_answer`, `explain_sentence`, `schedule_review`, `study_stats`). Full reference: [`docs/mcp-integration.md`](docs/mcp-integration.md).

The server is read/compute only: it never touches the web app's IndexedDB and never uses the network.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1`–`7` | Jump to Today / Nouns / Verbs / Practice / Review / Progress / Settings |
| `p` | Open Practice |
| `Space` | Reveal the swipe-card answer |
| `←` / `→` | Grade the swipe-card ("didn't know" / "knew it") |
| `Enter` | Submit answer / continue |
| `Ctrl/Cmd+Z` | Undo the last swipe grading (restores FSRS state) |

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system design and package boundaries
- [`docs/learning-engine.md`](docs/learning-engine.md) — grading rules, FSRS scheduling, sessions, metrics
- [`docs/data-model.md`](docs/data-model.md) — content model, IndexedDB schema, backup format
- [`docs/engagement-research.md`](docs/engagement-research.md) — 72-source research review with confidence tags
- [`docs/mcp-integration.md`](docs/mcp-integration.md) — MCP tools reference
- [`docs/deployment.md`](docs/deployment.md) — GitHub Pages deployment and PWA details
- [`docs/testing.md`](docs/testing.md) — unit + e2e strategy
- [`docs/roadmap.md`](docs/roadmap.md) — what's next

## Privacy

No backend. No API keys. No analytics. All progress lives in your browser's IndexedDB and can be exported to a JSON file at any time.

## License

MIT — see [LICENSE](LICENSE).

## GitHub sign-in and cross-device progress

Choose **Continue with GitHub** and use **Sync** whenever needed. Completed
sessions automatically sync to `progress.json` on this repository's
`progress-data` branch. Offline reviews remain saved locally until they sync.
The progress JSON is intentionally public; credentials are never included.

**One-time activation:** run `npm run setup:sync` on your own computer. This
registers the GitHub App, deploys the small authentication Worker, installs its
connection, sets the frontend endpoint and triggers Pages deployment. You must
approve the GitHub registration/installation and sign in to your Cloudflare
account. Until that setup is complete, local practice works and the interface
clearly reports that GitHub sync is not connected.

See [setup and sync behavior](docs/github-sync.md), [owner access](docs/owner-access.md),
and [the learning engine](docs/learning-engine.md). The historical audit and its
regression tests remain under [docs/audit](docs/audit/REPORT.md).
