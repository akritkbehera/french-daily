/**
 * Session composition and the session state machine.
 *
 * A daily session has three sections (nouns / verbs / sentences) and never
 * presents the same content item twice unless the learner answered it
 * incorrectly — failed items are appended as explicit retries (max 2 per item).
 */
import {
  generateSentenceExercise,
  generateVerbExercise,
  generateVocabExercise,
  type ExerciseSources,
  type FilterOptions,
  rngFromSeed,
} from './exercises';
import { gradeSelection, gradeTypedAnswer } from './grading';
import { type Rng, shuffle } from './random';
import { isReviewDue, reviewPriority } from './spacedRepetition';
import type {
  Exercise,
  GradeResult,
  ReviewState,
  SessionConfig,
  SessionItem,
  SessionSection,
  SessionState,
  SessionSummary,
  WeakArea,
} from './types';
import { todayLocal, type IsoDate } from './dates';

/** Session sizes: exercises per section. */
export const SESSION_SIZES = {
  short: 3,
  standard: 5,
  long: 7,
} as const;

export function defaultSessionConfig(size: 'short' | 'standard' | 'long' = 'standard'): SessionConfig {
  const n = SESSION_SIZES[size];
  return { mode: 'daily', nouns: n, verbs: n, sentences: n, topics: 'all', levels: 'all', kinds: 'all' };
}

const MAX_RETRIES_PER_ITEM = 2;

function filterFrom(config: SessionConfig): FilterOptions {
  return { topics: config.topics, levels: config.levels, kinds: config.kinds };
}

/**
 * Build a session. Items already due for review are prioritised, then
 * previously-failed items, then unseen items (weighted toward new material).
 */
export function buildSession(
  config: SessionConfig,
  sources: ExerciseSources,
  reviewStates: Map<string, ReviewState>,
  today: IsoDate = todayLocal(),
  seed: string | number = today + JSON.stringify(config),
): SessionState {
  const rng = rngFromSeed(seed);
  const filter = filterFrom(config);
  const items: SessionItem[] = [];
  const usedIds = new Set<string>();

  if (config.nouns > 0) {
    const exs = pickVocabExercises(sources, reviewStates, config.nouns, rng, filter, today, usedIds);
    for (const exercise of exs) items.push(toSessionItem(exercise, 'nouns'));
  }
  if (config.verbs > 0) {
    const exs = pickVerbExercises(sources, reviewStates, config.verbs, rng, filter, today, usedIds);
    for (const exercise of exs) items.push(toSessionItem(exercise, 'verbs'));
  }
  if (config.sentences > 0) {
    const exs = pickSentenceExercises(sources, reviewStates, config.sentences, rng, filter, today, usedIds);
    for (const exercise of exs) items.push(toSessionItem(exercise, 'sentences'));
  }

  return {
    id: `session-${today}-${Math.floor(rng() * 1e9).toString(36)}`,
    config,
    items,
    startedAt: Date.now(),
    finishedAt: null,
    complete: false,
  };
}

function toSessionItem(exercise: Exercise, section: SessionSection, retry = false): SessionItem {
  return { exercise, section, answered: false, response: null, grade: null, retry };
}

function pickVocabExercises(
  sources: ExerciseSources,
  states: Map<string, ReviewState>,
  count: number,
  rng: Rng,
  filter: FilterOptions,
  today: IsoDate,
  usedIds: Set<string>,
): Exercise[] {
  const pool = sources.vocabulary.filter((v) => !usedIds.has(v.id));
  const ordered = orderPool(pool.map((v) => v.id), states, today, rng);
  const byId = new Map(pool.map((v) => [v.id, v]));
  const out: Exercise[] = [];
  for (const id of ordered) {
    if (out.length >= count) break;
    const item = byId.get(id);
    if (!item) continue;
    const ex = generateVocabExercise(item, sources.vocabulary, rng, filter);
    if (!ex) continue;
    usedIds.add(id);
    out.push(ex);
  }
  return out;
}

function pickVerbExercises(
  sources: ExerciseSources,
  states: Map<string, ReviewState>,
  count: number,
  rng: Rng,
  filter: FilterOptions,
  today: IsoDate,
  usedIds: Set<string>,
): Exercise[] {
  const pool = sources.verbs.filter((v) => !usedIds.has(v.id));
  const ordered = orderPool(pool.map((v) => v.id), states, today, rng);
  const byId = new Map(pool.map((v) => [v.id, v]));
  const out: Exercise[] = [];
  for (const id of ordered) {
    if (out.length >= count) break;
    const verb = byId.get(id);
    if (!verb) continue;
    const ex = generateVerbExercise(verb, verb.fillComplement, rng, filter);
    if (!ex) continue;
    usedIds.add(id);
    out.push(ex);
  }
  return out;
}

function pickSentenceExercises(
  sources: ExerciseSources,
  states: Map<string, ReviewState>,
  count: number,
  rng: Rng,
  filter: FilterOptions,
  today: IsoDate,
  usedIds: Set<string>,
): Exercise[] {
  const pool = sources.sentences.filter((s) => !usedIds.has(s.id));
  const ordered = orderPool(pool.map((s) => s.id), states, today, rng);
  const byId = new Map(pool.map((s) => [s.id, s]));
  const out: Exercise[] = [];
  for (const id of ordered) {
    if (out.length >= count) break;
    const pair = byId.get(id);
    if (!pair) continue;
    const ex = generateSentenceExercise(pair, rng, filter);
    if (!ex) continue;
    usedIds.add(id);
    out.push(ex);
  }
  return out;
}

/**
 * Order a content pool for selection:
 *   1. due review items first (most overdue / most difficult),
 *   2. then remaining items shuffled (unseen material mixed in).
 */
function orderPool(ids: string[], states: Map<string, ReviewState>, today: IsoDate, rng: Rng): string[] {
  const due = ids.filter((id) => isReviewDue(states.get(id), today));
  const notDue = ids.filter((id) => !isReviewDue(states.get(id), today));
  due.sort((a, b) => reviewPriority(states.get(a), today) - reviewPriority(states.get(b), today));
  return [...due, ...shuffle(notDue, rng)];
}

/**
 * Grade a learner response for one exercise in the session.
 * Wrong answers are appended as retries (up to MAX_RETRIES_PER_ITEM per item).
 */
export function answerSessionItem(
  state: SessionState,
  exerciseId: string,
  response: string,
  selectionIndex?: number,
): { state: SessionState; grade: GradeResult | null } {
  const idx = state.items.findIndex((it) => it.exercise.id === exerciseId && !it.answered);
  if (idx === -1) return { state, grade: null };

  const item = state.items[idx];
  const exercise = item.exercise;
  let grade: GradeResult;
  if (selectionIndex !== undefined && exercise.kind === 'multiple-choice') {
    grade = gradeSelection(exercise, selectionIndex, exercise.correctIndex);
  } else {
    // Typed answers, including word-order (submitted as a joined token string).
    grade = gradeTypedAnswer(exercise, response);
  }

  const items = state.items.slice();
  items[idx] = { ...item, answered: true, response, grade };

  // Schedule an in-session retry for incorrect answers on non-retry items.
  if (!grade.isCorrect && !item.retry) {
    const retriesSoFar = items.filter(
      (it) => it.exercise.itemId === exercise.itemId && it.retry,
    ).length;
    if (retriesSoFar < MAX_RETRIES_PER_ITEM) {
      items.push(toSessionItem(exercise, item.section, true));
    }
  }

  return { state: { ...state, items }, grade };
}

/** Next unanswered exercise in order (first unanswered). */
export function nextExercise(state: SessionState): SessionItem | null {
  return state.items.find((it) => !it.answered) ?? null;
}

export function isSessionComplete(state: SessionState): boolean {
  return state.items.every((it) => it.answered);
}

/** Whether a session counts toward the daily streak (all exercises answered). */
export function countsTowardStreak(state: SessionState): boolean {
  return isSessionComplete(state) && state.items.length > 0;
}

/** Produce the end-of-session summary. */
export function summarizeSession(state: SessionState, streakDays: number, today: IsoDate = todayLocal()): SessionSummary {
  const answered = state.items.filter((it) => it.answered && it.grade);
  const correct = answered.filter((it) => it.grade!.isCorrect);
  const incorrect = answered.filter((it) => !it.grade!.isCorrect);
  const typos = answered.filter((it) => it.grade!.isTypo).length;

  const bySection: SessionSummary['bySection'] = {
    nouns: { correct: 0, total: 0 },
    verbs: { correct: 0, total: 0 },
    sentences: { correct: 0, total: 0 },
  };
  for (const it of answered) {
    bySection[it.section].total += 1;
    if (it.grade!.isCorrect) bySection[it.section].correct += 1;
  }

  const scheduledForReview = Array.from(new Set(incorrect.map((it) => it.exercise.itemId)));

  // Weak areas: group failures by item + exercise kind.
  const weakMap = new Map<string, WeakArea>();
  for (const it of incorrect) {
    const key = `${it.exercise.itemId}:${it.exercise.kind}`;
    const existing = weakMap.get(key);
    if (existing) existing.incorrect += 1;
    else
      weakMap.set(key, {
        label: it.exercise.prompt.length > 42 ? `${it.exercise.prompt.slice(0, 42)}…` : it.exercise.prompt,
        detail: it.exercise.instruction,
        itemId: it.exercise.itemId,
        incorrect: 1,
      });
  }

  return {
    total: answered.length,
    correct: correct.length,
    incorrect: incorrect.length,
    typos,
    accuracy: answered.length === 0 ? 0 : Math.round((correct.length / answered.length) * 100),
    bySection,
    scheduledForReview,
    weakAreas: [...weakMap.values()].sort((a, b) => b.incorrect - a.incorrect),
    streakDays,
    completedOn: today,
  };
}

/** Build a custom session config for topic/kind-filtered practice. */
export function customSessionConfig(opts: {
  size?: 'short' | 'standard' | 'long';
  topics?: SessionConfig['topics'];
  levels?: SessionConfig['levels'];
  kinds?: SessionConfig['kinds'];
  mode?: SessionConfig['mode'];
  nouns?: number;
  verbs?: number;
  sentences?: number;
}): SessionConfig {
  const base = defaultSessionConfig(opts.size ?? 'standard');
  return {
    ...base,
    mode: opts.mode ?? 'custom',
    topics: opts.topics ?? 'all',
    levels: opts.levels ?? 'all',
    kinds: opts.kinds ?? 'all',
    nouns: opts.nouns ?? base.nouns,
    verbs: opts.verbs ?? base.verbs,
    sentences: opts.sentences ?? base.sentences,
  };
}

/** Pick review items (for the Review screen) — due first. */
export function dueReviewStates(
  states: Map<string, ReviewState>,
  today: IsoDate = todayLocal(),
  limit = 50,
): ReviewState[] {
  const due = [...states.values()].filter((s) => isReviewDue(s, today));
  due.sort((a, b) => reviewPriority(a, today) - reviewPriority(b, today));
  return due.slice(0, limit);
}

/** Items that have failed most often (difficult material). */
export function hardestStates(states: Map<string, ReviewState>, limit = 10): ReviewState[] {
  return [...states.values()]
    .filter((s) => s.incorrectCount > 0)
    .sort((a, b) => b.difficulty - a.difficulty || b.incorrectCount - a.incorrectCount)
    .slice(0, limit);
}

