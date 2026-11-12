/**
 * Session composition and the session state machine.
 *
 * A daily session has three sections (nouns / verbs / sentences) and never
 * presents the same content item twice unless the learner answered it
 * incorrectly — failed items are appended as explicit retries (max 2 per item).
 */
import {
  makeEnToFrTranslation, makeFrToEnTranslation, makeGenderExercise,
  makeVocabMultipleChoice, makeConjugationFill, makeConjugationDirect,
  makeConjugationMultipleChoice, makeSentenceConstruction, makeWordOrder,
  type ExerciseSources, rngFromSeed,
} from './exercises';
import { gradeSelection, gradeTypedAnswer } from './grading';
import { shuffle } from './random';
import { isReviewDue, reviewPriority } from './spacedRepetition';
import type { Exercise, GradeResult, ReviewState, SessionConfig, SessionItem, SessionSection, SessionState, SessionSummary, WeakArea } from './types';
import { PRONOUNS } from './types';
import { todayLocal, type IsoDate } from './dates';

export const SESSION_SIZES = { short: 3, standard: 5, long: 7 } as const;
export function defaultSessionConfig(size: 'short' | 'standard' | 'long' = 'standard'): SessionConfig {
  const n = SESSION_SIZES[size];
  return { mode: 'daily', nouns: n, verbs: n, sentences: n, topics: 'all', levels: 'all', kinds: 'all' };
}
const MAX_RETRIES_PER_ITEM = 2;

/** All independently scheduled recall tasks; deterministic IDs survive updates. */
const catalogs = new WeakMap<ExerciseSources, Exercise[]>();
export function exerciseCatalog(sources: ExerciseSources): Exercise[] {
  const cached = catalogs.get(sources);
  if (cached) return cached;
  const rng = rngFromSeed('catalog-v2');
  const exercises = [
    ...sources.vocabulary.flatMap(v => [
      makeEnToFrTranslation(v, () => 0), makeEnToFrTranslation(v, () => 0.9),
      makeFrToEnTranslation(v), makeGenderExercise(v, 'definite'),
      ...(v.countable === false ? [] : [makeGenderExercise(v, 'indefinite')]),
      makeVocabMultipleChoice(v, sources.vocabulary, rng, 'en-fr'),
      makeVocabMultipleChoice(v, sources.vocabulary, rng, 'fr-en'),
    ]),
    ...sources.verbs.flatMap(v => PRONOUNS.flatMap(p => [
      makeConjugationFill(v, p, v.fillComplement), makeConjugationDirect(v, p),
      makeConjugationMultipleChoice(v, p, rng),
    ])),
    ...sources.sentences.flatMap(s => [makeSentenceConstruction(s, 'en-fr'), makeSentenceConstruction(s, 'fr-en'), makeWordOrder(s, rng)]),
  ];
  const catalog = [...new Map(exercises.map(ex => [ex.id, ex])).values()];
  catalogs.set(sources, catalog);
  return catalog;
}

export function buildSession(
  config: SessionConfig, sources: ExerciseSources, reviewStates: Map<string, ReviewState>,
  today: IsoDate = todayLocal(), seed: string | number = today + JSON.stringify(config),
): SessionState {
  const rng = rngFromSeed(seed);
  const catalog = exerciseCatalog(sources);
  const accepts = (ex: Exercise) =>
    (config.topics === 'all' || config.topics.includes(ex.topic)) &&
    (config.levels === 'all' || config.levels.includes(ex.level)) &&
    (config.kinds === 'all' || config.kinds.includes(ex.kind));
  const candidates = catalog.filter(accepts);
  // Legacy input remains supported for callers/imports. Bind a legacy state to
  // one task, never copy a lemma's mastery to every recall direction.
  const states = new Map(reviewStates);
  for (const state of reviewStates.values()) {
    if (!state.itemId.includes('::')) {
      const ex = candidates.find(e => e.itemId === state.itemId);
      if (ex) states.set(ex.id, state);
    }
  }
  const due = candidates.filter(ex => states.has(ex.id) && isReviewDue(states.get(ex.id), today));
  due.sort((a, b) => reviewPriority(states.get(a.id), today) - reviewPriority(states.get(b.id), today));
  const unseen = shuffle(candidates.filter(ex => !states.has(ex.id)), rng);
  const sectionFor = (ex: Exercise): SessionSection => ex.reviewKind === 'vocab' ? 'nouns' : ex.reviewKind === 'verb' ? 'verbs' : 'sentences';
  const chosen: Exercise[] = [];
  if (config.mode === 'review') {
    chosen.push(...due.slice(0, config.nouns + config.verbs + config.sentences));
  } else {
    const counts = { nouns: 0, verbs: 0, sentences: 0 };
    const used = new Set<string>();
    for (const ex of [...due, ...unseen]) {
      const section = sectionFor(ex);
      if (counts[section] >= config[section] || used.has(ex.itemId)) continue;
      chosen.push(ex); used.add(ex.itemId); counts[section]++;
    }
  }
  return { id: `session-${today}-${Math.floor(rng() * 1e9).toString(36)}`, config,
    items: chosen.map(ex => toSessionItem(ex, sectionFor(ex))), startedAt: Date.now(), finishedAt: null, complete: false };
}
function toSessionItem(exercise: Exercise, section: SessionSection, retry = false): SessionItem {
  return { exercise, section, answered: false, response: null, grade: null, retry };
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
  if (!grade.isCorrect) {
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

