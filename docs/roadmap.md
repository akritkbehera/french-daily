# Roadmap

Shipped today: the complete local-first app — engine, content, PWA, tests, docs, MCP server, GitHub Pages deployment. This roadmap is prioritized the same way the build was: **learning quality first, engagement second, polish last** (see `docs/engagement-research.md` for the evidence behind the ordering).

## Tier 1 — Learning depth (highest value)

1. **Per-user FSRS parameter fitting.** Default FSRS-4.5 weights are good; fitted weights are better (benchmark: user-fitted FSRS improves calibration further). Add an optional local optimizer over the user's own `ReviewState` history — runs in-browser, no telemetry, opt-in.
2. **More tenses.** Passé composé and futur proche content + conjugation tables (the engine's `VerbGroup`/`regularEnding` design extends naturally). Requires new curated content with the same validation rigor.
3. **Sentence-first vocabulary.** Research is clear that decontextualized word lists bore users; every noun already carries an example, but a cloze-by-default presentation mode would lean further into context.
4. **Weak-area graduation.** A gentle "you've mastered the basics — try reading/listening next" path when mastered counts pass thresholds, instead of infinitely queueing new cards (Clozemaster plateau evidence, research §3–4).

## Tier 2 — Engagement refinements (all optional, all toggleable)

5. **Share cards.** Export a milestone as an image (canvas, local, no server). Research: shareable artifacts beat leaderboards (recommendation 8).
6. **"Why this card now" line.** One sentence on each review card explaining the schedule ("last seen 6 days ago, ~90% recall expected"). Transparency builds trust in the scheduler (recommendation 4).
7. **Local A/B for swipe vs tap grading.** The research gap is explicit: no experimental evidence that swiping helps learning. A seeded, local-only, opt-in comparison of grading modes would let the app follow evidence instead of fashion.
8. **Reminder scheduling.** User-scheduled, calm, easy-to-silence notifications (currently a single optional toggle) — never streak-loss pressure (recommendation 10).

## Tier 3 — Platform & polish

9. **Accessibility audit.** axe-core pass, screen-reader walkthrough (VoiceOver/TalkBack), focus-trap audit on overlays.
10. **Firefox/WebKit e2e.** Expand Playwright beyond Chromium once stable runners are available for those engines.
11. **i18n of the UI.** The app UI is English (learning content is French); localize strings for French-first or other learners.
12. **Deck/notes import.** Accept CSV/Anki-APKG *import into a user namespace* — user content that flows through the same validation and FSRS machinery. Careful scope: never a feed, never shared social decks (Memrise trust-collapse lesson, research §3).

## Explicit non-goals

These are permanently out of scope — they are the manipulative patterns the research flags as red lines (research §6):

- Randomized rewards, loot boxes, variable-ratio "mystery" mechanics.
- Streak shame, loss-aversion countdowns, guilt notifications.
- Infinite feeds or sessions without an end.
- Leaderboards/leagues as a default experience.
- Paywalling the core learning loop (grading, explanations, review modes).
- Timed speed-review modes that reward guessing.
- Telemetry of any kind. Local metrics stay on the device.

If monetization ever happens (unlikely), it must sell *new content or themes* — never core loops, never data.

## Maintenance watchlist

- **FSRS upstream**: FSRS-5/6/7 exist; revisit the port when the algorithm stabilizes (Anki integration pipeline is active). The engine isolates the algorithm in `fsrs.ts`, so a swap is contained.
- **Content growth**: every addition must pass `validate.ts`; consider a small CI script that prints corpus stats (counts per topic/level) on each PR.
- **Dependency hygiene**: quarterly `npm audit`, keep React/Vite/Playwright on current majors.
