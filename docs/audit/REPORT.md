# French Daily independent audit

**Historical report:** findings below describe the original commit. The repair release converts the 14 reproductions to regression tests and addresses the findings; see `docs/learning-engine.md` and `docs/owner-access.md` for current behavior.

Audited 12 November 2026. Source: `akritkbehera/french-daily`, commit `24ca7aff09e8816c3b210b9d594703df6904f368`.

**Verdict: usable prototype, but review scheduling, undo, data recovery and French content need correction before relying on the app for daily learning.** Passing the original checks does not establish those properties.

This is an audit, not a repair release. Production source and the remote repository were not changed. The files in this directory are the report and isolated reproductions.

## Validation evidence

| Check | Result | Limits |
|---|---|---|
| `npm ci` | Passed | Used committed lockfile |
| `npm run check` | Passed | Lint, four TypeScript projects, 103 tests, MCP build and web build |
| Independent audit suite | 14/14 defect reproductions confirmed | Tests assert the observed broken behavior; green means reproduced, not fixed |
| Built MCP over stdio | Connected; eight tools discovered; three tool calls succeeded | Found answer disclosure and malformed plural output |
| Live app | Loaded Today and revealed a recall card; desktop layout inspected | Did not save a live review |
| Existing Playwright suite | Blocked before browser launch | All 68 project cases were unable to launch because Chromium was absent; download then failed with a truncated/invalid archive. These are environment errors, not 68 confirmed application failures |
| Mobile browser, real touch, offline reload, update lifecycle | Not verified | Requires a working browser test runner, plus iOS Safari/device checks |

Production bundle: JS 481.22 kB uncompressed / 150.57 kB gzip; CSS 27.66 kB / 6.10 kB gzip. Workbox generated a service worker and 15 precache entries (534.14 KiB). These build measurements do not prove offline operation or frame-rate performance.

Run the isolated reproductions from the repository root:

```sh
npx vitest run --config docs/audit/vitest.config.ts
```

They use fake IndexedDB in the test process and do not touch browser learning history. Preserve them as evidence; when fixing each issue, convert its assertions to the desired behavior.

## Priority 1: learning correctness and data integrity

### 1. Easy is Good; Hard is recorded as an incorrect typo

`apps/web/src/components/SwipeDeck.tsx:125–143`, `apps/web/src/storage/repos.ts:76–85`.

The four visible controls do not produce four independent recall ratings. Easy and Good both become a correct `GradeResult`, and `recordAttempt` derives rating 3 from it. Hard is manufactured as `outcome: 'typo', isCorrect: false`, so successful but difficult recall damages accuracy and failure metrics. A01 and A02 reproduce both persisted outcomes.

**Fix:** carry an explicit recall rating separately from objective answer correctness, from UI to persistence and scheduler. Test all four ratings against both attempt history and resulting intervals. Do not infer self-assessed recall from a spelling-error category.

### 2. Undo leaves a newly introduced card scheduled

`apps/web/src/components/SwipeDeck.tsx:166–177`.

History stores `prevReview: null` for a first review but does not store the reviewed item ID independently. Undo computes its deletion key from `prevReview?.itemId`, which is undefined. It deletes the attempt and moves the UI backward while leaving the review row. A03 confirms zero attempts but one scheduled review after undo.

**Fix:** retain card ID, previous state and attempt ID together. Restore/delete them atomically and recompute dependent challenge progress. Serialize undo with grading.

### 3. Fast repeat grading can commit one card twice and skip the next

`apps/web/src/components/SwipeDeck.tsx:122–163`.

The `flying` guard is set only after awaiting storage. Multiple clicks enter before that guard changes, each saving the same card and scheduling an advance. A13 reproduces two attempts for one item and a jump from 12 to 10 remaining.

**Fix:** acquire a synchronous in-flight ref before the first await; disable rating controls while saving; release on handled failure. Apply equivalent protection to focused-session submission/completion and undo.

### 4. Swipe drills can starve overdue reviews

`apps/web/src/components/SwipeDeck.tsx:68–100`.

Unseen items get the synthetic date `'0'`, which sorts before every real review date. Category slices are taken before the shuffle. With a large unseen pool, overdue cards are never selected. A14 completes all 12 cards while an explicitly overdue noun remains untouched. Future reviews are also not excluded when the fresh pool runs out.

**Fix:** build one shared queue with explicit overdue, due, learning, new and optional ahead-of-schedule tiers. Shuffle within a tier, never across priority boundaries. Bound new material.

### 5. Review sessions introduce new material and need not clear the queue

`apps/web/src/hooks/useApp.tsx:111–112`, `packages/learning-core/src/session.ts:58–93,166–175`.

`mode: 'review'` changes configuration metadata but not pool eligibility. A04 starts a noun-only review with exactly one due item and receives that item plus two unseen items. The UI's ordinary review action also requests fixed category counts; nine due nouns can therefore yield three noun reviews and unrelated material rather than clearing the noun backlog.

**Fix:** review mode must select only existing due review cards across categories; stop when exhausted. Keep an explicit practice action for new/ahead material.

### 6. Different recall tasks overwrite one memory state

`apps/web/src/storage/db.ts:40`, `apps/web/src/storage/repos.ts:82–85`, `packages/learning-core/src/exercises.ts`.

Persistence is keyed by lemma/content `itemId`. English→French, French→English, gender selection and recognition all advance the same noun schedule. All six subject forms of a verb likewise share one state. A05 confirms that opposite translation directions produce one review row with count 2. Recognizing an English meaning can postpone a French-production task the learner has never recalled.

**Fix:** separate content IDs from stable review-card IDs, including direction/task and conjugation subject. Migrate existing history explicitly; do not silently duplicate its mastery across every variant.

### 7. Review writes are not atomic

`apps/web/src/storage/repos.ts:63–87`, `apps/web/src/components/SessionRunner.tsx:82–100`.

Attempt insertion, reading current state, advancing the schedule and challenge refresh are separate operations. A07 injects a review-write failure and leaves an attempt committed with no review state. Concurrent operations can also read the same previous state. Focused-session feedback advances before save completes and provides no recovery UI for a rejected save.

**Fix:** transact the attempt plus review-state read/modify/write; serialize reviews per card. Make secondary challenge work recoverable without causing a successful review to appear failed. Expose save failures and prevent advancing until the required write succeeds.

### 8. A malformed backup can replace valid progress

`apps/web/src/storage/backup.ts:70–95`.

Validation checks container markers and two arrays but not their row schemas. A08 imports `reviews: [{ itemId: 'broken' }]`; import reports success and replaces valid reviews with an unusable object. Date validity, finite scheduler numbers, enums and record relationships are unchecked. Settings save occurs outside the restore transaction, and `keepTheme` suppresses all settings restoration rather than preserving only theme.

**Fix:** validate the entire versioned payload before clearing anything, reject unsupported/invalid versions, restore settings and progress in one transaction, and preserve a recovery snapshot. Catch persistence errors and return the advertised structured import error.

### 9. Generated French includes singular articles on plural-only nouns

`packages/french-data/src/validate.ts:50–67`, `packages/learning-core/src/exercises.ts:61–116`.

The model treats every lemma as singular. `lunettes`, `vacances` and `pâtes` enter singular article paths. A09 produces `la lunettes` both as the expected French translation and as a French prompt. Merely setting `plural: 'lunettes'` does not encode that the learning sense is plural. Dataset tests validate consistency with the same generator rather than independent grammatical truth.

**Fix:** add grammatical-number and countability metadata; support plural and partitive prompts; curate expected phrases independently. Audit every noun's generated definite/indefinite/plural surface forms. Elision in generated verb fill prompts also needs review: a `je ___ (aimer)` template with expected `aime` renders the unelided subject when filled.

## Priority 2: scheduler fidelity, engagement and delivery

### 10. The custom scheduler differs from the claimed FSRS-4.5 formula

`packages/learning-core/src/fsrs.ts:153–155`.

The implementation uses the 17 FSRS-4.5 weights but reverts difficulty toward `D0(Easy)`. The official algorithm reference says FSRS-4.5 and earlier revert toward `D0(Good)`; the Easy target was introduced in FSRS-5. A11 verifies a 0.0381238 downward difficulty deviation after an initial Good followed by Good. This is separate from the documented day-only simplifications.

**Fix:** use a maintained, version-pinned scheduler library with a migration plan and reference vectors. If retaining this port, declare its exact variant and prove numerical parity against the chosen version. Minute-level learning/relearning and same-day behavior are currently absent; the code should not imply full Anki scheduling parity.

Primary reference: <https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm>, FSRS-5 mean reversion and FSRS v4/4.5 sections, read during this audit.

### 11. Challenge refresh creates duplicate stored challenges

`apps/web/src/storage/repos.ts:152–170`.

New rows already have `date::challengeId` as their primary key. Refresh prefixes the date again and uses `bulkPut` without deleting old keys. A06 shows row counts 3→6→9 after two refreshes. Old progress remains alongside updated copies. Longer history increases processing and identifier size; a reload can show duplicate/stale challenges.

**Fix:** use `date::def.id` as a stable key and migrate/deduplicate existing rows. Test idempotency and current progress with unconditional assertions. The original challenge test searches for an unprefixed ID and skips its assertions when absent.

### 12. Recovery challenges lose credit when an answer is corrected

`packages/learning-core/src/challenges.ts:168–170`.

Progress intersects today's correct attempts with items whose *current latest* attempt is wrong. Correcting an item removes it from that set. A12 confirms failure followed by success contributes zero to “Fix missed.” The “Finish reviews” calculation also counts any item reviewed today and scheduled forward, including new cards, rather than a captured due cohort.

**Fix:** persist the challenge's target card cohort at generation, and count qualifying successful corrections/reviews against that cohort.

### 13. Gender hints disclose the answer

`packages/learning-core/src/exercises.ts:132–151`, `apps/web/src/components/ExerciseCard.tsx:106–111`.

A gender-selection card displays “feminine” or “masculine” before the learner responds. For a consonant-initial noun in definite singular practice this determines the answer. A10 confirms the disclosure. Recognition success is then used to advance the shared noun schedule.

**Fix:** offer optional hints that are logged, and reserve gender metadata for feedback by default.

### 14. Completed swipe drills do not count as completed sessions

`apps/web/src/components/SwipeDeck.tsx:148–159,270–279`, `apps/web/src/screens/TodayScreen.tsx:30–71`.

A14 confirms that 12 saved attempts and a “Deck complete” screen produce zero session records. Swipe attempts have null duration and a different session ID per card. They cannot contribute to completed-session minutes/streaks. Today's counts and challenges load only on mount and do not refresh after each swipe; the screen can show stale progress even while writes succeed. Milestone checking on Today also passes aggregate mastered-item count as both vocabulary and verb counts.

**Fix:** use a stable drill session ID, record one completion, measure active time, and refresh projections reactively. Calculate separate vocabulary/verb mastery totals.

### 15. “Hide answer” MCP exercises still disclose the answer

`packages/mcp-server/src/index.ts:242–250`.

Confirmed through the built stdio server, not just inspection: `generate_exercise({section:'nouns',kind:'multiple-choice',seed:'audit',includeAnswer:false})` returns `correctIndex: 3` and an explanation beginning `la jupe = the skirt`. Only `expected` and `accepted` are removed. Word ordering can similarly expose `correctOrder`. `lookup_word('lunettes')` returns `definitePlural: 'leslunettes'` without a space.

**Fix:** define a separate public quiz schema excluding correctness indexes, answer order and explanatory answers, rather than destructuring two fields from the internal exercise. Use schema-level protocol tests. Existing MCP tests call shared functions, not actual registered tools.

### 16. PWA updates and notification controls are incomplete

`apps/web/vite.config.ts:19`, `apps/web/src/App.tsx`, `apps/web/src/screens/SettingsScreen.tsx:171–181`.

The service worker uses `registerType: 'prompt'`, but the source contains no `useRegisterSW`/`needRefresh`/update-worker UI integration. A newly installed worker can wait without the promised update notification. The notification toggle requests permission and persists a boolean; no reminder scheduling/delivery implementation exists in the source inspected.

**Fix:** implement a safe update notification and worker activation after pending reviews have saved. Label reminders as unavailable until a supported delivery mechanism exists; permission alone is not a reminder.

### 17. Gesture cancellation and exit motion need correction

`apps/web/src/components/SwipeDeck.tsx:211–249,374–390`.

`pointercancel` is routed through pointer-up grading instead of unconditional cancellation. A browser scroll/cancel can therefore reach the commit test. The flick threshold has no minimum displacement, which increases accidental-commit risk. The inline style also sets `transition: 'none'` when `flying`, so the exit transform jumps offscreen instead of animating for the 230 ms delay. These are source-confirmed paths; real-touch behavior and frame timing remain unverified.

**Fix:** separate cancel handling, require minimum flick displacement and horizontal intent, animate exits with compositor-friendly transforms, and test real touch scrolling plus reduced motion.

## Test and accessibility gaps

- Deployment runs no browser tests; no pull-request CI trigger is present in the deployment workflow.
- Existing undo E2E checks card count and a toast, not database rollback. Its persistence test checks generic Progress text rather than exact saved attempt/state.
- No offline reload/service-worker upgrade test exists in the inspected E2E suite. The timing sanity check is not a 60 fps measurement.
- All four configured viewport projects use Chromium; an iPhone viewport does not establish Safari support.
- Settings/Nouns/Verbs/Review/Progress use `SectionTitle`, which is an `h2`; `gotoApp` only verifies the initial Today `h1`. Heading and focus hierarchy need a screen-by-screen accessibility check.
- Session overlay and abandon confirmation use plain fixed divs, without dialog semantics or a focus trap. Background global navigation/keyboard listeners remain mounted while a session is open. Verify keyboard containment, screen-reader exposure, and focus return.
- The 72-source engagement document was inspected for structure, not revalidated link by link. Its existence is not evidence that every cited finding was faithfully implemented or scientifically established.

## Recommended repair order

1. Transactional saves, duplicate-commit guard, undo rollback, full backup validation.
2. Explicit four-rating API, stable review-card identity, maintained scheduler and migrations.
3. Shared due-first queue and truly due-only review sessions.
4. Number/countability-aware French content and independently curated grammar fixtures.
5. Stable challenge IDs/cohorts, accurate session accounting and reactive progress.
6. Safe PWA updates, gesture cancellation/motion, dialogs and mobile accessibility.
7. Protocol-level MCP tests and an actual production-build browser CI job, including offline/update cases.

Ship a reviewed repair branch with a migration/rollback strategy for existing IndexedDB data. Re-run browser checks at all four requested sizes and on Safari before making reliability or performance claims.
