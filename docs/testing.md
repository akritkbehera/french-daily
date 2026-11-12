# Testing

French Daily has three test layers, all runnable locally and in CI via `npm run check` (lint + typecheck + unit + build) and `npm run test:e2e`.

Current status: **103 unit tests** and **66 Playwright e2e tests** (2 mobile-only skipped at desktop width), all green.

## 1. Unit tests (Vitest)

Run: `npm test` (or `npm run test:watch`).

| Area | File(s) | What it locks down |
| --- | --- | --- |
| Text, grading, conjugation, metrics | `learning-core/src/tests/engine.test.ts` | 5-way outcome classification, accent-vs-typo-vs-article distinctions, alternative-answer handling, normalization (apostrophes, case, spacing), learned/mastered definitions, learning-vs-engagement metric separation |
| FSRS + scheduling | `learning-core/src/tests/scheduling.test.ts` | Retrievability formula (regression test for the `1/DECAY` exponent bug), stability/difficulty updates, lapse → 1-day relearn, interval clamping, rating mapping, `ReviewState` transitions, `reviewPriority` ordering (overdue → hard → never-reviewed last) |
| Sessions | `learning-core/src/tests/session.test.ts` | Deterministic generation, in-session retries (max 2), no back-to-back repeats, completion gating, summaries |
| Engagement | `learning-core/src/tests/engagement.test.ts` | Challenge derivation, streak logic (local dates), milestone rules, recovery rate |
| Dataset | `french-data/src/tests/dataset.test.ts` | Validation rules (ids, gender, elision, verb endings, alternatives) over the full 300+/60+/50+ corpus |
| Persistence | `apps/web/src/storage/repos.test.ts` | `recordAttempt` → FSRS persistence, challenge refresh, streaks, milestone dedupe (fake-indexeddb) |
| Backup | `apps/web/src/storage/backup.test.ts` | JSON round-trip, foreign/invalid/future-version rejection without data loss, reset semantics |
| UI | `apps/web/src/components/components.test.tsx` | ExerciseCard flows per kind, feedback panel, continue-by-Enter, Nav coverage of all 7 screens (React Testing Library + jsdom) |
| MCP | `mcp-server/src/server.test.ts` | Tool contracts: search, conjugation explanations, grading categories, FSRS step, dataset completeness |

Determinism is a testing feature: sessions and exercises take a `seed`, so tests assert exact behavior rather than poking at randomness.

## 2. End-to-end tests (Playwright)

Run: `npm run test:e2e` — the config builds and serves the **production** bundle at `http://localhost:4173/french-daily/` (same base path GitHub Pages uses).

**Viewport matrix** (Chromium forced on all four; devices provide realistic touch/viewport behavior):

| Project | Viewport |
| --- | --- |
| `mobile-s` | 375×812 |
| `mobile-l` | 390×844 |
| `tablet` | 768×1024 |
| `desktop` | 1440×900 |

**Coverage** (`e2e/french-daily.spec.ts`):

- *App shell* — loads, all 7 screens navigate with **no horizontal overflow** at any viewport, exactly one visible `navigation` landmark (bottom bar on mobile, sidebar on desktop), keyboard shortcuts 1–7.
- *Swipe gestures* — accidental-swipe prevention (unrevealed cards can't be graded), sub-threshold drag springs back without grading, past-threshold drag commits, keyboard grading (Space/←/→), explicit grade buttons, **undo** (button and Ctrl/Cmd+Z) restores the previous count and shows "Last grading undone".
- *Review scheduling & persistence* — graded attempts survive reload (FSRS state + attempts), partial sessions don't count, full sessions show an honest summary ("Session complete · N correct · M incorrect") and count toward streaks.
- *Accessibility & motion* — `prefers-reduced-motion: reduce` honored while grading still works; theme toggle flips the `dark` class.
- *Mobile perf sanity* — first heading visible quickly, total JS transfer well under budget, nav hit targets ≥ 40px tall.

**Robustness lessons baked in:**

- The e2e session loop is a **deterministic state machine**: each step awaits the UI transition (click → expect) instead of racing with React re-renders. This caught a real bug — `SessionRunner` used to advance to the next exercise *while showing the previous one's feedback*, detaching the DOM mid-interaction (fixed by pinning `gradedItemId` while feedback shows).
- Swipe fly-off transforms must not create horizontal scroll (`overflow-x: clip`), or Playwright's scrolling-to-click shifts every hit target. This is now a permanent e2e assertion.
- Long session tests set explicit budgets (`test.setTimeout`), since a full session with retries answers up to ~2× items.

## 3. Lint & typecheck

- **TypeScript**: strict per-package `tsconfig`s (`typecheck` script covers all four packages + the app).
- **ESLint 9** flat config (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `react-hooks` recommended. Test files relax `no-explicit-any`; Node build scripts declare Node globals.

## Running everything

```bash
npm run check        # eslint → tsc (4 projects) → vitest → production build
npm run test:e2e     # Playwright (builds + previews the app first)
```

CI runs `npm run check` and the e2e matrix on every push to `main` before deployment (see `docs/deployment.md`).

## Gaps & future work

- No WebKit/Firefox e2e (Chromium-only for determinism; the PWA targets standard APIs).
- Reduced-motion and haptics are asserted structurally, not audited with a screen reader — an axe pass is on the roadmap.
- FSRS parameter fitting per user is not tested (default weights are); a simulator test is on the roadmap.
