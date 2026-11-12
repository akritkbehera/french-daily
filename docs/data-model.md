# Data Model

Two kinds of data, deliberately separated:

1. **Content** — ships with the app (`packages/french-data`), read-only, validated at import time.
2. **Progress** — user-generated, stored in IndexedDB via Dexie, exportable to JSON. Keyed by content ids so app/content upgrades never orphan history.

## Content model (`@french-daily/french-data`)

### `VocabItem` (300+)
```ts
{
  id: 'noun:maison',            // stable, namespaced
  french: 'maison',
  english: ['house', 'home'],
  gender: 'f',                  // 'm' | 'f'
  elision: false,               // true ⇒ h-initial words that take l'/d'
  plural: 'maisons',
  articles: {
    definiteSingular: 'la', indefiniteSingular: 'une',
    definitePlural: 'les',    indefinitePlural: 'des',
  },
  level: 'A1',                  // 'A1' | 'A2' | 'B1'
  topic: 'home',                // 15 topics
  exampleFr: 'La maison est grande.',
  exampleEn: 'The house is big.',
}
```

### `Verb` (60+)
```ts
{
  id: 'verb:etre',
  infinitive: 'être',
  english: 'to be',
  group: 'irregular',           // 'er' | 'ir' | 're' | 'irregular'
  reflexive: false,
  forms: { je: 'suis', tu: 'es', il: 'est', nous: 'sommes', vous: 'êtes', ils: 'sont' },
  fillComplement: '… content',  // used by conjugation-fill exercises
  exampleFr: '…', exampleEn: '…',
}
```

### `SentencePair` (50+)
```ts
{
  id: 'sent:buy-cheese',
  en: 'I am buying some cheese.',
  fr: "J'achète du fromage.",
  alternatives: ['J’achète du fromage.'],   // curated, deterministic
  topic: 'shopping', level: 'A1',
  note: 'Du = de + le, partitive "some".',
}
```

### Validation (`validate.ts`, fail-fast at import)
- Unique ids across all collections.
- `gender` ∈ {m, f}; elision explicitly flagged for h-initial words that take `l'`.
- Example sentences must contain their lemma.
- Verb group endings must be consistent with the infinitive (regular patterns).
- No duplicate `alternatives`; alternatives must differ from the canonical sentence.

A validation failure **throws at module import** — broken data cannot reach the app or tests.

## Progress model (Dexie / IndexedDB)

Database `french-daily`, schema v1 (additive migrations only; rows are never dropped):

| Table | Key | Indexes | Row |
| --- | --- | --- | --- |
| `attempts` | `++id` | `itemId, date, timestamp, sessionId, kind` | `AttemptRecord` |
| `reviews` | `itemId` | `nextDue, kind, status, difficulty` | `ReviewState` |
| `sessions` | `++id` | `sessionId, date, timestamp, mode` | `SessionCompletionRecord` |
| `milestones` | `++id` | `kind, date` | `MilestoneRecord` |
| `challenges` | `id` (`${date}::${def.id}`) | `date` | `ChallengeProgress` |
| `settings` | `'settings'` | — | `AppSettings` |

### `AttemptRecord`
One graded answer: `itemId`, `kind` ('vocab'|'verb'|'sentence'), `sessionId`, `date` (local ISO), `timestamp`, `response`, `correct`, `outcome` (5-way), `rating` (FSRS 1–4), `durationMs` (nullable), `retry` flag.

### `ReviewState` (FSRS, one row per content id)
`itemId`, `stability`, `difficulty`, `lastInterval`, `reps`, `lapses`, `reviewCount`, `correctCount`, `incorrectCount`, `lapseCount`, `lastReviewed`, `nextDue` (local ISO date), `history` (append-only summaries).

### `SessionCompletionRecord`
Created **only** when a session is completed (every item answered): `sessionId`, `mode`, `date`, `durationMs`, `summary` (per-section accuracy, typos, weak areas, scheduled-for-review).

### `AppSettings`
Theme (`light|dark|system`), `sessionSize`, `desiredRetention` (0.80–0.95), `dailyGoalMinutes`, `soundEnabled`, `hapticsEnabled`, `pronunciationEnabled`, `celebrationsEnabled`, `streaksEnabled`, `notificationsEnabled` (off by default), `streak`, `longestStreak`, `lastCompletionDate`, `lastExportAt`.

### Write path (`repos.ts`)
`recordAttempt()` is the single grading write: in one Dexie transaction it appends the `AttemptRecord`, applies the FSRS transition to `reviews`, and refreshes today's challenge progress. It returns `{ attemptId, reviewState }` — the `attemptId` enables **undo** (swipe deck deletes the attempt and restores the exact previous `ReviewState` snapshot).

`recordSessionCompletion()` writes the completion record and advances streaks (consecutive local dates; forgiving by design — see Settings copy and `docs/engagement-research.md` recommendation 7). `checkMilestones()` writes milestone rows with dedupe by `(kind, value)`.

## Backup format

JSON export (`storage/backup.ts`), `BACKUP_VERSION = 1`:

```json
{
  "app": "french-daily",
  "kind": "progress-backup",
  "backupVersion": 1,
  "exportedAt": "2026-11-12T12:00:00.000Z",
  "reviews": [ …ReviewState ],
  "attempts": [ …AttemptRecord ],
  "sessions": [ … ],
  "milestones": [ … ],
  "challenges": [ … ],
  "settings": { …AppSettings }
}
```

Import rules: must parse as JSON; `app` must be `french-daily`; `backupVersion` must be ≤ the current version (forward-incompatible files are refused with a clear message); a failed import **never modifies** existing data; import runs in one transaction (clear + bulk put). Reset clears progress tables and optionally settings (default: keep settings; streak resets to 0).

## Date/timezone policy

All day-bucketed logic uses local dates (`YYYY-MM-DD`, `dates.ts`) — never `toISOString()` slices — so "today", streaks, and due dates are correct in any timezone. Timestamps (attempt ordering, durations) are epoch ms.

## Id conventions

- `noun:<lemma>` — vocabulary
- `verb:<infinitive without spaces>` — verbs
- `sent:<slug>` — sentence pairs

`labelForContentId(id)` maps any content id to a human label (used in Review/Progress lists and the MCP server).
