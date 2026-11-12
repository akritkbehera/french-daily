# Learning Engine

`packages/learning-core` is a pure-TypeScript engine: no DOM, no storage, no network. This document specifies its behavior; the implementation is authoritative via its tests (`packages/learning-core/src/tests/`).

## 1. Text normalization

Before comparison, answers are normalized:

- Unicode **NFC**, lowercase, whitespace collapsed.
- **Apostrophes** unified (`'` = `’`), so `l'ecole` vs `l’école` differ only by accent.
- **Leading articles** are identified and strippable (`le/la/l'/les/un/une/des`) so the article can be graded separately from the noun.

## 2. Deterministic grading (5 outcomes)

`gradeAnswerList(response, expected, accepted[], explanation)` returns a `GradeResult`:

| `outcome` | Meaning | Scoring | FSRS rating |
| --- | --- | --- | --- |
| `correct` | Exact match (normalized) or in curated `accepted` alternatives | correct | Good (3) |
| `accent` | Matches after stripping accents only | incorrect, typo-class | Hard (2) |
| `typo` | Levenshtein distance ≤ threshold (article-stripped) | incorrect, typo-class | Hard (2) |
| `article` | Right word(s), missing or wrong article | incorrect | Again (1) |
| `wrong` | Grammatically/lexically wrong | incorrect | Again (1) |

Rules:

- **Accent vs grammar is a real distinction.** `ecole` for `école` is `accent` — a keyboard problem, not a knowledge problem — and is punished gently (FSRS Hard, not Again).
- **Alternative answers are curated, never machine-generated.** Sentence exercises carry `accepted` lists (apostrophe variants, equally valid translations like `Je vois…` / `Je retrouve…`).
- Every incorrect result carries an `explanation`; correct results may echo one. The UI always shows the correct form + explanation after grading (see `docs/engagement-research.md`, recommendation 3).
- Grading is order-independent of UI: the same triple (response, expected, accepted) always yields the same result. No fuzzy LLM matching anywhere.

## 3. FSRS-4.5 scheduling

`fsrs.ts` implements the open-source FSRS-4.5 memory model (17 default weights).

**Memory model.** Retrievability after `t` days with stability `S`:

```
R(t, S) = (1 + FACTOR · t / S) ^ DECAY        FACTOR = 19/81,  DECAY = -0.5
```

(Note: the exponent is `DECAY` itself — a former `1/DECAY` transcription bug was caught by unit tests.)

**Interval for a target retention** `R₀` (default 0.9, user-adjustable 0.80–0.95):

```
I(S) = clamp(round(S / FACTOR · (R₀ ^ (1/DECAY) − 1)), 1, 36500)
```

**Review step.** `fsrsReview(prev, rating, elapsedDays, desiredRetention)`:

- *First review*: `fsrsInitState(rating)` sets initial stability/difficulty from the rating.
- *Subsequent*: retrievability is computed at `elapsedDays`; stability and difficulty update per FSRS-4.5 formulas (difficulty clamped 1–10).
- *Lapse (Again)*: next interval is forced to **1 day** (relearn), and `lapseCount` increments.

**Rating mapping** (`spacedRepetition.ts`) — how app grading outcomes become FSRS ratings:

- `correct` → Good (3)
- `accent` / `typo` → Hard (2)
- `article` / `wrong` → Again (1)

**ReviewState** (per content id) tracks `stability`, `difficulty`, `lastInterval`, `reps`, `lapses`, `reviewCount`, `correctCount`, `incorrectCount`, `lapseCount`, `lastReviewed`, `nextDue` (local ISO date), and `history` (append-only attempt summaries).

**Estimated retention** = current retrievability of each reviewed item at today's date; the Progress screen shows the mean.

**Review priority** (`reviewPriority`): overdue items first (most overdue first), then lower-retrievability/harder items, then due-today; **never-reviewed items sort last** (they get a +5000 offset) so mastered-and-forgotten content resurfaces before brand-new content in review sessions.

All date handling is timezone-safe: local dates as `YYYY-MM-DD` strings (`dates.ts`), never UTC timestamps for day boundaries.

## 4. Exercise generation

`exercises.ts` generates 7 kinds, deterministically from a seeded RNG (`random.ts`):

1. `translation-typed` — EN→FR or FR→EN, typed answer + curated alternatives.
2. `multiple-choice` — distractors drawn from same-topic items.
3. `conjugation-fill` — sentence with a missing verb form (complement provided).
4. `conjugation-direct` — "conjugate X for pronoun Y", elision-aware display.
5. `word-order` — scrambled tokens, tile ordering.
6. `sentence-construction` — build the sentence from a word bank.
7. `gender-select` — article/gender selection (`le/la/l'/les/un/une/des`).

Filters (`FilterOptions`): topic, level, kind. Generation is reproducible: same seed + same content ⇒ same exercises. Verb exercises include the required irregular set (être, avoir, aller, faire, venir, prendre, pouvoir, vouloir, devoir, savoir, voir, dire, mettre, partir, sortir, dormir, manger, commencer, finir, vendre, se lever, se laver…).

## 5. Sessions

`session.ts` composes a finite `SessionState` from a `SessionConfig`:

- Default daily shape: **5 nouns + 5 verbs + 5 sentences** (sizes: short 9 / standard 15 / long 24).
- Filters: mode (`daily` / `review` / `custom`), topics, levels, kinds.
- **In-session retries (max 2)**: a failed item re-queues *in the same session* so nothing slips through unfinished, but the same item never repeats back-to-back.
- `answerSessionItem(state, id, response)` grades, applies FSRS, and returns the updated state + grade. The app persists via `repos.recordAttempt` (see `docs/data-model.md`).
- `summarizeSession(state)` produces the completion summary: per-section accuracy, typos count, items scheduled for review, weak areas. **A session counts only when every item is answered** (`isSessionComplete`) — abandoned partial sessions never count toward streaks or session metrics.

## 6. Mastery definitions (precise)

Computed over attempts + review state per content id:

- **Learned** = ≥ 2 correct attempts on ≥ 2 distinct days.
- **Mastered** = ≥ 4 correct attempts across ≥ 3 distinct days **and** FSRS interval ≥ 7 days.

These are shown verbatim in the Progress screen so "learned" and "mastered" are never ambiguous.

## 7. Metrics: learning vs engagement

Two separate calculations (`metrics.ts`) — the UI groups them in distinct sections and engagement is explicitly labeled "habit — not proficiency":

**Learning quality**: accuracy, estimated retention (FSRS retrievability now), learned/mastered counts, recovery rate (failed items later answered correctly), avg seconds per exercise, due/overdue backlog, mean difficulty, difficult-items list, accuracy-over-time series.

**Engagement (habit)**: sessions today/total, minutes today vs goal, streak days / longest streak, exercises today, weekly activity. Streaks update only on completed sessions; a day is active if any attempt is recorded.

## 8. Daily challenges

`challenges.ts` rotates a small set of challenges (2–4 per day, seeded by date) derived from **real learning needs**, each carrying a `derivedFrom` provenance string shown in the UI:

- fix missed answers (targets recently failed items),
- recall N nouns / conjugate N verbs (volume, section-scoped),
- N correct in a row (consistency),
- N irregular conjugations (known-difficulty content).

Progress is recomputed from recorded attempts whenever the Today screen loads; challenges are finite daily goals, not infinite feeds.

## 9. What the engine deliberately does not do

- No LLM grading or generation — every decision is inspectable and testable.
- No timer-based speed scoring (research: speed modes reward guessing and feel hollow — `docs/engagement-research.md` §4).
- No randomized rewards, streak penalties, or loss-aversion scheduling. FSRS intervals never shrink as a "punishment"; only actual lapses affect state.
