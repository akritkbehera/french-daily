/**
 * Daily challenges + learning/engagement metrics + progress definitions.
 */
import { describe, expect, it } from 'vitest';
import {
  computeEngagementMetrics,
  computeItemStats,
  computeLearningMetrics,
  generateChallenges,
  isLearned,
  isMastered,
  progressOverview,
  recentlyMissedItems,
  refreshChallenges,
  accuracyOverTime,
  reviewBacklog,
  difficultItems,
  weeklyActivity,
  type AttemptRecord,
  type ChallengeContext,
  type ReviewState,
} from '@french-daily/learning-core';

function attempt(itemId: string, date: string, correct: boolean, overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    itemId,
    kind: 'vocab',
    exerciseKind: 'translation-typed',
    date,
    timestamp: new Date(`${date}T10:00:00`).getTime(),
    response: correct ? 'ok' : 'no',
    outcome: correct ? 'correct' : 'wrong',
    correct,
    sessionId: `s-${date}`,
    durationMs: 8000,
    rating: correct ? 3 : 1,
    ...overrides,
  };
}

function reviewState(itemId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    itemId,
    kind: 'vocab',
    status: 'review',
    lastReviewed: '2026-11-12',
    nextDue: '2026-11-20',
    reviewCount: 4,
    correctCount: 3,
    incorrectCount: 1,
    lapseCount: 1,
    reps: 3,
    interval: 8,
    stability: 12,
    difficulty: 4,
    lastRating: 3,
    ...overrides,
  };
}

describe('daily challenges', () => {
  const today = '2026-11-12';

  function ctx(attemptsToday: AttemptRecord[] = [], attemptsAll: AttemptRecord[] = [], reviews = new Map<string, ReviewState>()): ChallengeContext {
    return {
      today,
      reviews,
      attemptsToday,
      attemptsAll,
      irregularVerbIds: new Set(['verb:être', 'verb:aller']),
      counts: { vocab: 300, verbs: 80, sentences: 50 },
    };
  }

  it('generates 3 challenges deterministically per day', () => {
    const a = generateChallenges(ctx());
    const b = generateChallenges(ctx());
    expect(a).toHaveLength(3);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('only offers "finish reviews" when reviews are actually due', () => {
    const noneDue = generateChallenges(ctx());
    expect(noneDue.every((c) => c.id !== 'finish-reviews')).toBe(true);

    const reviews = new Map([['noun:maison', reviewState('noun:maison', { nextDue: '2026-11-12' })]]);
    const withDue = generateChallenges(ctx([], [], reviews));
    expect(withDue.some((c) => c.id === 'finish-reviews')).toBe(true);
  });

  it('only offers "fix missed" when there are recently missed items', () => {
    const clean = generateChallenges(ctx([], []));
    expect(clean.every((c) => c.id !== 'fix-missed')).toBe(true);

    const failed = [attempt('noun:maison', '2026-11-11', false)];
    const withMissed = generateChallenges(ctx([], failed));
    expect(withMissed.some((c) => c.id === 'fix-missed')).toBe(true);
  });

  it('computes progress from real attempts, not swipe counts', () => {
    const attempts = [
      attempt('noun:a', today, true),
      attempt('noun:b', today, true),
      attempt('verb:être', today, true, { kind: 'verb' }),
    ];
    const c = ctx(attempts, attempts);
    const nouns = generateChallenges(c).find((x) => x.id === 'recall-nouns');
    if (nouns) expect(nouns.progress).toBe(2);

    const irr = generateChallenges(c).find((x) => x.id === 'irregular-conjugations');
    if (irr) expect(irr.progress).toBe(1);
  });

  it('tracks the longest correct run for accuracy-run', () => {
    const attempts = [
      attempt('noun:a', today, true),
      attempt('noun:b', today, true),
      attempt('noun:c', today, false),
      attempt('noun:d', today, true),
      attempt('noun:e', today, true),
    ];
    const c = ctx(attempts, attempts);
    const run = generateChallenges(c).find((x) => x.id === 'accuracy-run');
    if (run) expect(run.progress).toBe(2);
  });

  it('refreshes progress after new attempts', () => {
    const c0 = ctx([], []);
    const challenges = generateChallenges(c0);
    const attempts = Array.from({ length: 12 }, (_, i) => attempt(`noun:${i}`, today, true));
    const refreshed = refreshChallenges(challenges, ctx(attempts, attempts));
    const nouns = refreshed.find((x) => x.id === 'recall-nouns');
    if (nouns) {
      expect(nouns.progress).toBe(12);
      expect(nouns.completed).toBe(true);
    }
  });

  it('recentlyMissedItems uses the latest attempt only', () => {
    const attempts = [
      attempt('noun:a', '2026-11-10', false),
      attempt('noun:a', '2026-11-11', true),
      attempt('noun:b', '2026-11-11', false),
    ];
    const missed = recentlyMissedItems(attempts, today);
    expect(missed.has('noun:a')).toBe(false);
    expect(missed.has('noun:b')).toBe(true);
  });
});

describe('learning metrics', () => {
  const today = '2026-11-12';

  it('separates learning metrics from engagement metrics', () => {
    const attempts = [
      attempt('noun:a', today, true),
      attempt('noun:b', today, false),
      attempt('noun:b', today, true),
    ];
    const reviews = new Map([['noun:a', reviewState('noun:a')]]);
    const learning = computeLearningMetrics(attempts, reviews, today);
    expect(learning.totalAttempts).toBe(3);
    expect(learning.accuracy).toBe(67);
    expect(learning.failedCards).toBe(1);
    expect(learning.recoveredCards).toBe(1);
    expect(learning.recoveryRate).toBe(100);
    expect(learning.avgSecondsPerExercise).toBe(8);
    expect(learning.estimatedRetention).not.toBeNull();

    const engagement = computeEngagementMetrics(attempts, [], [], 5, 9, today);
    expect(engagement.streakDays).toBe(5);
    expect(engagement.exercisesToday).toBe(3);
    expect(engagement.sessionsToday).toBe(0);
  });

  it('reports null retention before any review', () => {
    const learning = computeLearningMetrics([], new Map(), today);
    expect(learning.estimatedRetention).toBeNull();
    expect(learning.accuracy).toBe(0);
    expect(learning.avgSecondsPerExercise).toBeNull();
  });
});

describe('progress definitions', () => {
  it('learned requires 2 correct attempts on 2 distinct days', () => {
    const stats = computeItemStats([
      attempt('noun:a', '2026-11-10', true),
      attempt('noun:a', '2026-11-10', true),
      attempt('noun:a', '2026-11-11', true),
    ]);
    expect(isLearned(stats.get('noun:a'))).toBe(true);

    const crammed = computeItemStats([
      attempt('noun:a', '2026-11-10', true),
      attempt('noun:a', '2026-11-10', true),
    ]);
    expect(isLearned(crammed.get('noun:a'))).toBe(false);
  });

  it('mastered additionally requires a long FSRS interval', () => {
    const attempts = [
      attempt('noun:a', '2026-11-08', true),
      attempt('noun:a', '2026-11-09', true),
      attempt('noun:a', '2026-11-10', true),
      attempt('noun:a', '2026-11-11', true),
    ];
    const stats = computeItemStats(attempts);
    const shortIvl = reviewState('noun:a', { interval: 3 });
    const longIvl = reviewState('noun:a', { interval: 12 });
    expect(isMastered(stats.get('noun:a'), shortIvl)).toBe(false);
    expect(isMastered(stats.get('noun:a'), longIvl)).toBe(true);
  });

  it('overview counts attempted/learned/mastered accurately', () => {
    const attempts = [
      attempt('noun:a', '2026-11-10', true),
      attempt('noun:a', '2026-11-11', true),
      attempt('noun:b', '2026-11-11', false),
    ];
    const reviews = new Map([['noun:a', reviewState('noun:a', { interval: 30 })]]);
    const ov = progressOverview(attempts, reviews, 300);
    expect(ov.attempted).toBe(2);
    expect(ov.learned).toBe(1);
    // Not mastered yet: mastery needs ≥4 correct attempts across ≥3 days.
    expect(ov.mastered).toBe(0);
    expect(ov.totalItems).toBe(300);
  });

  it('computes accuracy over time and weekly activity with empty days', () => {
    const attempts = [attempt('noun:a', '2026-11-11', true), attempt('noun:b', '2026-11-11', false)];
    const series = accuracyOverTime(attempts, 5, '2026-11-12');
    expect(series).toHaveLength(5);
    const day = series.find((d) => d.date === '2026-11-11')!;
    expect(day.accuracy).toBe(50);
    expect(series.find((d) => d.date === '2026-11-12')!.total).toBe(0);

    const week = weeklyActivity(attempts, [], '2026-11-12');
    expect(week).toHaveLength(7);
    expect(week.find((d) => d.date === '2026-11-11')!.exercises).toBe(2);
  });

  it('reports review backlog and difficult items', () => {
    const reviews = new Map([
      ['noun:a', reviewState('noun:a', { nextDue: '2026-11-12' })],
      ['noun:b', reviewState('noun:b', { nextDue: '2026-11-01' })],
      ['noun:c', reviewState('noun:c', { nextDue: '2026-12-01' })],
    ]);
    const backlog = reviewBacklog(reviews, '2026-11-12');
    expect(backlog.due).toBe(2);
    expect(backlog.overdue).toBe(1);

    const attempts = [attempt('noun:b', '2026-11-11', false), attempt('noun:b', '2026-11-11', false)];
    const difficult = difficultItems(attempts, reviews, (id) => id, 5);
    expect(difficult[0].itemId).toBe('noun:b');
    expect(difficult[0].failures).toBe(2);
  });
});
