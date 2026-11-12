/**
 * Spaced-repetition review state — backed by FSRS (see ./fsrs.ts).
 *
 * This module maps grading outcomes onto FSRS ratings and maintains the
 * persisted ReviewState for each content item. All functions are pure and
 * take `today` (local YYYY-MM-DD) explicitly, so scheduling is timezone-safe
 * and fully deterministic in tests.
 *
 * Rating mapping (documented in docs/learning-engine.md):
 *   correct        → Good  (3)
 *   accent / typo  → Hard  (2)  — recalled, but the spelling needs care
 *   article        → Again (1)  — the article carries gender; treated as a miss
 *   wrong          → Again (1)
 */
import { DEFAULT_DESIRED_RETENTION, fsrsInterval, fsrsReview, retrievability, type FsrsRating } from './fsrs';
import type { GradeOutcome, GradeResult, ReviewKind, ReviewState } from './types';
import { addDays, type IsoDate, todayLocal } from './dates';

export { DEFAULT_DESIRED_RETENTION, fsrsInterval, retrievability };
export type { FsrsRating };

/** Map a grading outcome to an FSRS rating. */
export function ratingFor(outcome: GradeOutcome): FsrsRating {
  switch (outcome) {
    case 'correct':
      return 3;
    case 'accent':
      return 2;
    case 'typo':
      return 2;
    case 'article':
      return 1;
    case 'wrong':
      return 1;
  }
}

export function ratingFromGrade(grade: GradeResult): FsrsRating {
  return ratingFor(grade.outcome);
}

/** The review state of an item that has never been reviewed. */
export function initialReviewState(itemId: string, kind: ReviewKind, today: IsoDate = todayLocal()): ReviewState {
  return {
    itemId,
    kind,
    status: 'new',
    lastReviewed: today,
    nextDue: today,
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lapseCount: 0,
    reps: 0,
    interval: 0,
    stability: 0,
    difficulty: 5,
    lastRating: null,
  };
}

/**
 * Apply one graded review. Pure: returns a new ReviewState.
 * FSRS state is advanced from the rating derived from the grade.
 */
export function applyReview(
  state: ReviewState,
  grade: GradeResult,
  today: IsoDate = todayLocal(),
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
): ReviewState {
  const rating = ratingFromGrade(grade);
  const elapsed = Math.max(0, dayDiff(state.lastReviewed, today));
  const prev = state.reviewCount === 0
    ? null
    : {
        stability: state.stability,
        difficulty: state.difficulty,
        lastInterval: state.interval,
        reps: state.reps,
        lapses: state.lapseCount,
      };

  const result = fsrsReview(prev, rating, elapsed, desiredRetention);
  const correctCount = state.correctCount + (grade.isCorrect ? 1 : 0);
  const incorrectCount = state.incorrectCount + (grade.isCorrect ? 0 : 1);
  const reviewCount = state.reviewCount + 1;

  return {
    ...state,
    status: rating === 1 ? 'learning' : 'review',
    lastReviewed: today,
    nextDue: addDays(today, result.interval),
    reviewCount,
    correctCount,
    incorrectCount,
    lapseCount: result.state.lapses,
    reps: result.state.reps,
    interval: result.interval,
    stability: Math.round(result.state.stability * 100) / 100,
    difficulty: Math.round(result.state.difficulty * 100) / 100,
    lastRating: rating,
  };
}

/**
 * Normalized difficulty in 0..1 (1 = hardest) for sorting and dashboards.
 * Derived from FSRS difficulty (1..10).
 */
export function difficultyScore(state: ReviewState | undefined): number {
  if (!state) return 0.5;
  return Math.min(1, Math.max(0, (state.difficulty - 1) / 9));
}

/** Estimated probability of recall right now (FSRS retrievability). */
export function estimatedRetention(state: ReviewState | undefined, today: IsoDate = todayLocal()): number | null {
  if (!state || state.reviewCount === 0 || state.stability <= 0) return null;
  return retrievability(dayDiff(state.lastReviewed, today), state.stability);
}

/** True when the item is due for review on `today`. */
export function isReviewDue(state: ReviewState | undefined, today: IsoDate = todayLocal()): boolean {
  if (!state) return true; // never reviewed → available
  return state.nextDue <= today;
}

/**
 * Selection priority for due items (lower sorts first):
 *   1. overdue first (most overdue first),
 *   2. then previously-failed / difficult items,
 *   3. then most-stable items,
 *   4. never-reviewed items last (overdue reviews outrank new material).
 */
export function reviewPriority(state: ReviewState | undefined, today: IsoDate = todayLocal()): number {
  if (!state) return 5_000;
  const overdueDays = Math.max(0, dayIndex(today) - dayIndex(state.nextDue));
  const base = -(overdueDays * 1000) + (1 - difficultyScore(state)) * 100 + Math.min(5, state.reps) * 10;
  return state.reviewCount === 0 ? base + 5_000 : base;
}

function dayIndex(iso: IsoDate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return y * 372 + m * 31 + d;
}

function dayDiff(from: IsoDate, to: IsoDate): number {
  // Both endpoints are local noon dates, so DST cannot shift the result.
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1, 12).getTime();
  const t2 = new Date(y2, m2 - 1, d2, 12).getTime();
  return Math.round((t2 - t1) / 86_400_000);
}
