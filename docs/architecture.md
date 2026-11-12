# Architecture

French Daily is an npm-workspaces monorepo with a hard boundary between **pure learning logic** and **the app that presents it**. Nothing in the engine touches React, the DOM, or storage; nothing in the web app reimplements learning rules.

```
┌────────────────────────────────────────────────────────────┐
│ apps/web  (React + Vite + Tailwind, PWA)                   │
│   screens/  components/  hooks/  services/  storage/        │
│   storage: Dexie (IndexedDB) — attempts, reviews, sessions  │
│   services: WebAudio tones, haptics, Web Speech (fr-FR TTS) │
└──────────────┬─────────────────────────────┬───────────────┘
               │ imports (TS source aliases) │
┌──────────────▼───────────────┐  ┌──────────▼───────────────┐
│ packages/learning-core       │  │ packages/french-data     │
│  pure TS engine              │  │  curated content +       │
│  text · grading · FSRS ·     │  │  fail-fast validation    │
│  exercises · sessions ·      │  └──────────────────────────┘
│  challenges · metrics        │
└──────────────┬───────────────┘
               │ imports (bundled by esbuild)
┌──────────────▼───────────────┐
│ packages/mcp-server          │
│  MCP stdio server, 8 tools   │
└──────────────────────────────┘
```

## Packages

### `packages/learning-core` (`@french-daily/learning-core`)
Pure TypeScript, zero runtime dependencies, no DOM. Modules:

| Module | Responsibility |
| --- | --- |
| `text.ts` | Unicode normalization, accents, apostrophes, article stripping, Levenshtein |
| `grading.ts` | Deterministic answer grading (5 outcomes) + explanations |
| `articles.ts` | Gender/elision-aware article handling (`le/la/l'/les`) |
| `conjugation.ts` | Pronoun display, elision, regular endings, explanations |
| `fsrs.ts` | FSRS-4.5: 17 default weights, retrievability, stability/difficulty updates, intervals |
| `spacedRepetition.ts` | Grading-outcome → FSRS rating mapping, `ReviewState` transitions, review priority |
| `exercises.ts` | Deterministic generation of the 7 exercise kinds |
| `session.ts` | Session composition, answering, in-session retries (max 2), summaries |
| `challenges.ts` | Rotating daily challenge definitions derived from real learning needs |
| `progress.ts` / `metrics.ts` | Accuracy, retention, mastery, recovery; engagement metrics kept separate |
| `dates.ts` | Timezone-safe local ISO dates (`YYYY-MM-DD`) |
| `random.ts` | Seeded RNG so sessions are reproducible given a seed |

Everything is exported through `src/index.ts` and consumed **as source** (Vite/Vitest aliases) — no intermediate build for app use.

### `packages/french-data` (`@french-daily/french-data`)
- `vocab-part-a.ts` / `vocab-part-b.ts` — 300+ nouns/adj. with gender, articles, plural, elision flag, level (A1–B1), topic, examples.
- `verbs.ts` — 60+ verbs (incl. irregulars and reflexives) with complete present-tense tables and example sentences.
- `sentences.ts` — 50+ EN↔FR sentence pairs with curated alternative translations and grammar notes.
- `validate.ts` — import-time validation: unique ids, gender ∈ {m,f}, explicit elision flags for h-initial words, example sentences must contain the lemma, verb-group ending consistency, no duplicate alternatives. **Validation failures throw at import** so bad data can never ship.
- `index.ts` — validated exports plus lookups (`labelForContentId`, `irregularVerbIds`).

### `packages/mcp-server` (`@french-daily/mcp-server`)
An MCP server over stdio exposing the engine to AI assistants. Built with `@modelcontextprotocol/sdk` and zod schemas, bundled to a single ESM `dist/index.js` by esbuild (`build.mjs`, `createRequire` banner for CJS deps). Read/compute only — never the network, never IndexedDB. See [`mcp-integration.md`](mcp-integration.md).

### `apps/web` (`@fd/web`)
React 19 + TypeScript + Vite 6 + Tailwind 4.

- **`screens/`** — the 7-screen IA: `Today`, `Nouns`, `Verbs`, `Practice`, `Review`, `Progress`, `Settings`. No client-side router: view switching is state (avoids GitHub Pages 404s); `?view=` is honored only for PWA shortcuts.
- **`components/`** — `SwipeDeck` (gestures, spring, undo), `SessionRunner` (finite session lifecycle + summary), `ExerciseCard` (all 7 kinds), `Charts`, `Nav`, UI primitives.
- **`hooks/useApp.tsx`** — single app context: settings, navigation, session lifecycle, toasts, theme.
- **`storage/`** — Dexie schema (`db.ts`), repositories (`repos.ts`: attempts → FSRS transitions → challenge refresh → milestones), backup (`backup.ts`: export/import/reset with validation).
- **`services/feedback.ts`** — optional effects: WebAudio-generated tones (no audio assets), `navigator.vibrate`, Web Speech API `fr-FR` TTS. All individually toggleable in Settings.
- **PWA** — `vite-plugin-pwa`, Workbox precache, manifest, generated icons (`scripts/generate-icons.mjs`, sharp), offline-first.

## Key design decisions

1. **Engine/presentation split.** Grading, scheduling, and metrics are unit-testable without a browser and reusable by the MCP server.
2. **No router.** A 7-state view switch is simpler and immune to GH Pages deep-link 404s; the app is a single load.
3. **Storage keyed by content ids.** User progress references stable ids (`noun:maison`, `verb:etre`, `sent:…`); content upgrades never invalidate history.
4. **Determinism everywhere.** Seeded RNG for session/exercise generation; deterministic grading (no LLM anywhere); MCP `generate_exercise` accepts a seed for reproducible output.
5. **Horizontal overflow is clipped** (`overflow-x: clip` on `html/body`, `overflow-hidden` on the swipe stack) — fly-off animations can never create sideways scroll under touch targets.
6. **Workspace packages as source.** Only the MCP server needs a build step; the web app compiles package TS directly.

## Data flow of one graded answer

```
ExerciseCard (response)
  → grading.gradeAnswerList(...)            [learning-core]
  → repos.recordAttempt(...)                [storage]
      1. write AttemptRecord
      2. spacedRepetition.applyReview(...)  FSRS state transition
      3. challenges.refreshToday(...)       derived progress
      → { attemptId, reviewState }
  → SessionRunner feedback (explanation + TTS + tone/haptic)
  → summary at completion → streak + milestones (complete sessions only)
```

Undo (swipe deck) restores the **previous `ReviewState` snapshot** and removes the attempt, using the `attemptId` returned above — scheduling and history always agree.
