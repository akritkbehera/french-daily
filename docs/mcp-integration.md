# MCP Integration

`packages/mcp-server` exposes the French Daily learning engine to AI assistants over the [Model Context Protocol](https://modelcontextprotocol.io) (stdio transport). It is the same engine the web app runs — deterministic grading, FSRS scheduling, validated content — so an assistant and the app can never disagree about what "correct" means.

## Design principles

- **Read/compute only.** No network calls. The server never touches the web app's IndexedDB; the only file access is reading the JSON progress file you explicitly pass to `study_stats`.
- **Deterministic.** No LLM grading; `generate_exercise` accepts a seed for reproducible output; `generate_exercise` can hide answers (`includeAnswer: false`) so an assistant can quiz a learner without leaking them.
- **Zero configuration.** Content is bundled; there are no API keys.

## Build & run

```bash
npm run build:packages     # esbuild → packages/mcp-server/dist/index.js (single ESM file)
node packages/mcp-server/dist/index.js
```

The server logs `french-daily MCP server v1.0.0 ready (stdio)` on **stderr** and speaks JSON-RPC on **stdout**.

## Registering with OpenCode

An `opencode.json` at the repo root registers the server (paths relative to the repo root):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "french-daily": {
      "type": "local",
      "command": ["node", "packages/mcp-server/dist/index.js"],
      "enabled": true
    }
  }
}
```

Build the bundle once before starting the client. Other MCP clients (Claude Desktop, etc.) can register the same command as a stdio server.

## Tools

### 1. `lookup_word`
Find vocabulary by French lemma or English meaning.
- Input: `query: string`, `limit?: 1–20` (default 5)
- Output: id, french, english[], gender, definite/indefinite article, elision, plural (+definite plural), level, topic, example pair.

### 2. `lookup_verb`
Present-indicative conjugation tables.
- Input: `query: string` (infinitive or English), `limit?: 1–10` (default 3)
- Output: id, infinitive, english, group, reflexive, full `present` table with pronouns elision-applied (`je suis`, `j’ai`…), example pair.

### 3. `conjugate`
Conjugate one verb for one pronoun — or return the full table.
- Input: `infinitive: string`, `pronoun?: je|tu|il|nous|vous|ils`
- Output (single): `form`, `display` (with pronoun + elision), and a grammar `explanation` of the form.
- Output (all): english, group, `present` table.

### 4. `generate_exercise`
Generate one deterministic exercise from the curated content.
- Input: `kind?` (7 kinds), `topic?`, `level?` (A1|A2|B1), `section?` (nouns|verbs|sentences), `seed?`, `includeAnswer?` (default true)
- Output: the exercise (prompt, instruction, hint…). With `includeAnswer: true` also `expected` + `accepted` alternatives.

### 5. `grade_answer`
Deterministically grade a typed answer. This is the same grader the app uses.
- Input: `response`, `expected`, `accepted?: string[]`, `explanation?`
- Output: `outcome` (`correct|accent|typo|article|wrong`), `isCorrect`, `isTypo`, `given`, `expected`, `feedback`, `explanation`.
- Accent mistakes are distinguished from grammar errors; missing/wrong articles are their own category; near-misses are flagged as typos.

### 6. `explain_sentence`
Look up a curated sentence pair with its grammar note.
- Input: `query` (sentence id, French text, or English text)
- Output: `en`, `fr`, `acceptedAlternatives`, `topic`, `level`, `grammarNote`.

### 7. `schedule_review`
Apply one FSRS-4.5 review step (see `docs/learning-engine.md`).
- Input: `rating: 1|2|3|4` (Again/Hard/Good/Easy), `stability?` (omit for a first review), `difficulty?` (1–10), `elapsed?` (days since last review), `desiredRetention?` (0.7–0.99, default 0.9)
- Output: `newState` (stability, difficulty…), `intervalDays`, `retrievabilityBeforeReview`, `desiredRetention`, `firstReviewIntervalDays` (for first reviews).

### 8. `study_stats`
Summarize a local JSON progress file into learning + engagement metrics.
- Input: `progressFile` (absolute path)
- Expected shape: `{ attempts, reviews, sessions?, challenges?, streak?, longestStreak? }` where `reviews` is an array of `ReviewState` objects (or `[itemId, state]` pairs). The web app's JSON backup export contains all of these fields.
- Output: `learning` (accuracy, estimated retention, learned/mastered counts, recovery…), `engagement` (sessions, streak…), and a note that engagement ≠ proficiency.

## Manual smoke test

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"grade_answer","arguments":{"response":"l\x27ecole","expected":"l\x27école"}}}' \
  | node packages/mcp-server/dist/index.js
```

`tools/list` returns the 8 tools; the `grade_answer` call reports `outcome: "accent"` for `l'ecole` vs `l'école`.

Contract-level tests live in `packages/mcp-server/src/server.test.ts` (runs in `npm test`).

## Example assistant workflows

- **Tutor mode:** `generate_exercise({ includeAnswer: false })` → learner answers in chat → `grade_answer` → if wrong, `explain_sentence` or `conjugate` for the underlying rule.
- **Study planning:** `study_stats` on the exported backup → identify weak areas → `generate_exercise({ topic })` targeted practice → `schedule_review` to explain when each item comes due.
- **Reference:** `lookup_word` / `lookup_verb` while writing French — gender, elision and conjugation answers are validated data, not guesses.

## Limitations

- The server has **no access to live app state**; progress comes from a JSON file you provide.
- `study_stats` trusts the file's contents (light validation); it does not re-run FSRS.
- Tenses beyond the present indicative are out of scope (the content itself is present-tense A1–B1).
