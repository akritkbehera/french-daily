/**
 * Progress analytics.
 *
 * Every metric shown in the dashboard is computed here from raw attempt and
 * review data, with precise definitions (documented in docs/learning-engine.md):
 *
 *  - Attempted:  at least one graded attempt.
 *  - Learned:    ≥ LEARNED_MIN_CORRECT correct attempts on ≥ LEARNED_MIN_DAYS distinct days.
 *  - Mastered:   ≥ MASTERED_MIN_CORRECT correct attempts on ≥ MASTERED_MIN_DAYS distinct days
 *                AND the SM-2 interval is ≥ MASTERED_MIN_INTERVAL days.
 */
import { lastNDates, todayLocal, type IsoDate } from './dates';
import { difficultyScore } from './spacedRepetition';
import type {
  AttemptRecord,
  ReviewState,
  SessionCompletionRecord,
} from './types';
import {
  LEARNED_MIN_CORRECT,
  LEARNED_MIN_DAYS,
  MASTERED_MIN_CORRECT,
  MASTERED_MIN_DAYS,
  MASTERED_MIN_INTERVAL,
} from './types';

export interface ItemStats {
  itemId: string;
  attempts: number;
  correct: number;
  incorrect: number;
  correctDays: Set<string>;
  lastAttempt: string;
}

/** Aggregate per-item attempt statistics. */
export function computeItemStats(attempts: AttemptRecord[]): Map<string, ItemStats> {
  const map = new Map<string, ItemStats>();
  for (const a of attempts) {
    const s = map.get(a.itemId) ?? {
      itemId: a.itemId,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      correctDays: new Set<string>(),
      lastAttempt: a.date,
    };
    s.attempts += 1;
    if (a.correct) {
      s.correct += 1;
      s.correctDays.add(a.date);
    } else {
      s.incorrect += 1;
    }
    if (a.date > s.lastAttempt) s.lastAttempt = a.date;
    map.set(a.itemId, s);
  }
  return map;
}

export function isLearned(stats: ItemStats | undefined): boolean {
  if (!stats) return false;
  return stats.correct >= LEARNED_MIN_CORRECT && stats.correctDays.size >= LEARNED_MIN_DAYS;
}

export function isMastered(stats: ItemStats | undefined, review: ReviewState | undefined): boolean {
  if (!stats || !review) return false;
  return (
    stats.correct >= MASTERED_MIN_CORRECT &&
    stats.correctDays.size >= MASTERED_MIN_DAYS &&
    review.interval >= MASTERED_MIN_INTERVAL
  );
}

export interface ProgressOverview {
  attempted: number;
  learned: number;
  mastered: number;
  totalItems: number;
  overallAccuracy: number;
  totalAttempts: number;
  totalCorrect: number;
}

export function progressOverview(
  attempts: AttemptRecord[],
  reviews: Map<string, ReviewState>,
  totalItems: number,
): ProgressOverview {
  const stats = computeItemStats(attempts);
  let learned = 0;
  let mastered = 0;
  for (const s of stats.values()) {
    if (isLearned(s)) learned += 1;
    if (isMastered(s, reviews.get(s.itemId))) mastered += 1;
  }
  const totalCorrect = attempts.filter((a) => a.correct).length;
  return {
    attempted: stats.size,
    learned,
    mastered,
    totalItems,
    totalAttempts: attempts.length,
    totalCorrect,
    overallAccuracy: attempts.length === 0 ? 0 : Math.round((totalCorrect / attempts.length) * 100),
  };
}

export interface DayAccuracy {
  date: IsoDate;
  total: number;
  correct: number;
  accuracy: number;
}

/** Accuracy for each of the last `days` local days (including empty days). */
export function accuracyOverTime(attempts: AttemptRecord[], days = 14, today: IsoDate = todayLocal()): DayAccuracy[] {
  const byDate = new Map<string, { total: number; correct: number }>();
  for (const a of attempts) {
    const e = byDate.get(a.date) ?? { total: 0, correct: 0 };
    e.total += 1;
    if (a.correct) e.correct += 1;
    byDate.set(a.date, e);
  }
  return lastNDates(today, days).map((date) => {
    const e = byDate.get(date) ?? { total: 0, correct: 0 };
    return {
      date,
      total: e.total,
      correct: e.correct,
      accuracy: e.total === 0 ? 0 : Math.round((e.correct / e.total) * 100),
    };
  });
}

export interface WeeklyActivity {
  date: IsoDate;
  exercises: number;
  sessions: number;
}

/** Exercises completed + sessions finished per day for the last 7 days. */
export function weeklyActivity(
  attempts: AttemptRecord[],
  completions: SessionCompletionRecord[],
  today: IsoDate = todayLocal(),
): WeeklyActivity[] {
  const dates = lastNDates(today, 7);
  return dates.map((date) => ({
    date,
    exercises: attempts.filter((a) => a.date === date).length,
    sessions: completions.filter((c) => c.date === date).length,
  }));
}

export interface DifficultEntry {
  itemId: string;
  label: string;
  failures: number;
  attempts: number;
  difficulty: number;
}

/** Most-failed items (difficult words / conjugations). */
export function difficultItems(
  attempts: AttemptRecord[],
  reviews: Map<string, ReviewState>,
  labelFor: (itemId: string) => string,
  limit = 8,
): DifficultEntry[] {
  const stats = computeItemStats(attempts);
  return [...stats.values()]
    .filter((s) => s.incorrect > 0)
    .map((s) => ({
      itemId: s.itemId,
      label: labelFor(s.itemId),
      failures: s.incorrect,
      attempts: s.attempts,
      difficulty: reviews.get(s.itemId) ? difficultyScore(reviews.get(s.itemId)) : s.incorrect / s.attempts,
    }))
    .sort((a, b) => b.failures - a.failures || b.difficulty - a.difficulty)
    .slice(0, limit);
}

/** Number of items due today plus overdue (the review backlog). */
export function reviewBacklog(reviews: Map<string, ReviewState>, today: IsoDate = todayLocal()): {
  due: number;
  overdue: number;
  scheduled: number;
} {
  let due = 0;
  let overdue = 0;
  for (const r of reviews.values()) {
    if (r.nextDue < today) {
      overdue += 1;
      due += 1;
    } else if (r.nextDue === today) {
      due += 1;
    }
  }
  return { due, overdue, scheduled: reviews.size };
}

/**
 * Compute a streak from completed-session dates.
 * A streak day is a local date on which at least one session was *fully*
 * completed (partial sessions never count). The streak is alive when the last
 * completion is today or yesterday.
 */
export function computeStreak(completedDates: IsoDate[], today: IsoDate = todayLocal()): number {
  const unique = new Set(completedDates);
  if (unique.size === 0) return 0;
  const sorted = [...unique].sort().reverse();
  const mostRecent = sorted[0];
  if (mostRecent > today) return 0;
  if (mostRecent !== today && mostRecent !== addDaysSafe(today, -1)) return 0;

  let streak = 0;
  let cursor = mostRecent;
  while (unique.has(cursor)) {
    streak += 1;
    cursor = addDaysSafe(cursor, -1);
  }
  return streak;
}

function addDaysSafe(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Vocabulary/verb counts by review state for the progress screen. */
export function countsByKind(reviews: Map<string, ReviewState>): { vocab: number; verb: number; sentence: number } {
  const out = { vocab: 0, verb: 0, sentence: 0 };
  for (const r of reviews.values()) {
    if (r.kind === 'vocab') out.vocab += 1;
    else if (r.kind === 'verb') out.verb += 1;
    else out.sentence += 1;
  }
  return out;
}
