/**
 * FSRS scheduler + review-state tests (deterministic).
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyReview,
  DEFAULT_DESIRED_RETENTION,
  difficultyScore,
  estimatedRetention,
  fsrsInitState,
  fsrsInterval,
  fsrsReview,
  gradeAnswerList,
  initialReviewState,
  isReviewDue,
  ratingFor,
  retrievability,
  reviewPriority,
  RATING,
} from '@french-daily/learning-core';

describe('FSRS core', () => {
  it('initializes stability from the rating', () => {
    expect(fsrsInitState(RATING.again).stability).toBeCloseTo(0.4872, 4);
    expect(fsrsInitState(RATING.good).stability).toBeCloseTo(3.7145, 4);
    expect(fsrsInitState(RATING.easy).stability).toBeGreaterThan(fsrsInitState(RATING.good).stability);
  });

  it('gives longer intervals for better ratings on first review', () => {
    const again = fsrsInitState(RATING.again);
    const hard = fsrsInitState(RATING.hard);
    const good = fsrsInitState(RATING.good);
    const easy = fsrsInitState(RATING.easy);
    expect(fsrsInterval(again.stability)).toBeLessThanOrEqual(fsrsInterval(hard.stability));
    expect(fsrsInterval(hard.stability)).toBeLessThan(fsrsInterval(good.stability));
    expect(fsrsInterval(good.stability)).toBeLessThan(fsrsInterval(easy.stability));
  });

  it('retrievability is 90% at t = S (by construction)', () => {
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 5);
    expect(retrievability(0, 5)).toBeCloseTo(1, 5);
    expect(retrievability(20, 5)).toBeLessThan(retrievability(5, 5));
    expect(retrievability(40, 5)).toBeLessThan(0.6);
  });

  it('successful reviews increase stability', () => {
    let state = fsrsInitState(RATING.good);
    const before = state.stability;
    const next = fsrsReview(state, RATING.good, 4);
    expect(next.state.stability).toBeGreaterThan(before);
    state = next.state;
  });

  it('forgetting collapses stability and counts a lapse', () => {
    const state = fsrsInitState(RATING.good);
    const next = fsrsReview(state, RATING.again, 10);
    expect(next.state.stability).toBeLessThan(state.stability);
    expect(next.state.lapses).toBe(state.lapses + 1);
    expect(next.interval).toBe(1);
  });

  it('is deterministic across runs', () => {
    const a = fsrsReview(fsrsInitState(RATING.good), RATING.hard, 3);
    const b = fsrsReview(fsrsInitState(RATING.good), RATING.hard, 3);
    expect(a).toEqual(b);
  });

  it('clamps difficulty to 1..10', () => {
    let state = fsrsInitState(RATING.good);
    for (let i = 0; i < 30; i++) {
      state = fsrsReview(state, RATING.again, 1).state;
    }
    expect(state.difficulty).toBeLessThanOrEqual(10);
    expect(state.difficulty).toBeGreaterThanOrEqual(1);
  });

  it('higher desired retention never yields longer intervals', () => {
    const s = fsrsInitState(RATING.good).stability;
    expect(fsrsInterval(s, 0.95)).toBeLessThanOrEqual(fsrsInterval(s, 0.85));
  });

  it('default retention is 0.9', () => {
    expect(DEFAULT_DESIRED_RETENTION).toBe(0.9);
  });
});

describe('review state transitions', () => {
  it('maps grading outcomes to FSRS ratings', () => {
    expect(ratingFor('correct')).toBe(RATING.good);
    expect(ratingFor('accent')).toBe(RATING.hard);
    expect(ratingFor('typo')).toBe(RATING.hard);
    expect(ratingFor('article')).toBe(RATING.again);
    expect(ratingFor('wrong')).toBe(RATING.again);
  });

  it('schedules nextDue today + interval using local dates', () => {
    const today = '2026-11-12';
    const grade = gradeAnswerList('la maison', 'la maison');
    const state = applyReview(initialReviewState('noun:maison', 'vocab', today), grade, today);
    expect(state.reviewCount).toBe(1);
    expect(state.correctCount).toBe(1);
    expect(state.interval).toBeGreaterThanOrEqual(1);
    expect(state.nextDue).toBe(addDays(today, state.interval));
  });

  it('a failed answer is due again tomorrow and counts a lapse', () => {
    const today = '2026-11-12';
    const grade = gradeAnswerList('le jardin', 'la maison');
    const state = applyReview(initialReviewState('noun:maison', 'vocab', today), grade, today);
    expect(state.incorrectCount).toBe(1);
    expect(state.lapseCount).toBe(1);
    expect(state.nextDue).toBe('2026-11-13');
    expect(state.status).toBe('learning');
  });

  it('tracks difficulty score in 0..1 and estimated retention', () => {
    const today = '2026-11-12';
    const good = gradeAnswerList('aller', 'aller');
    const state = applyReview(initialReviewState('verb:aller', 'verb', today), good, today);
    expect(difficultyScore(state)).toBeGreaterThanOrEqual(0);
    expect(difficultyScore(state)).toBeLessThanOrEqual(1);
    const est = estimatedRetention(state, today);
    expect(est).not.toBeNull();
    expect(est!).toBeGreaterThan(0.9);
  });

  it('due check and priority ordering prefer overdue, failed items', () => {
    const today = '2026-11-12';
    const fresh = initialReviewState('a', 'vocab', today);
    expect(isReviewDue(fresh, today)).toBe(true);

    const overdue = { ...initialReviewState('b', 'vocab', today), nextDue: '2026-11-01', reviewCount: 1, stability: 3, difficulty: 8 };
    const future = { ...initialReviewState('c', 'vocab', today), nextDue: '2026-12-01', reviewCount: 1, stability: 30, difficulty: 2 };
    expect(isReviewDue(future, today)).toBe(false);
    // Overdue reviewed items first, then future, then brand-new material.
    expect(reviewPriority(overdue, today)).toBeLessThan(reviewPriority(future, today));
    expect(reviewPriority(fresh, today)).toBeGreaterThan(reviewPriority(overdue, today));
    expect(reviewPriority(undefined, today)).toBeGreaterThan(reviewPriority(future, today));
  });
});
