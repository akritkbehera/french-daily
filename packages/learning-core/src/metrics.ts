/**
 * Learning metrics vs engagement metrics.
 *
 * Learning metrics measure recall quality (accuracy, retention, mastery,
 * recovery). Engagement metrics measure habit (sessions, streaks, challenges).
 * The dashboard keeps them strictly separate — engagement numbers are never
 * presented as language proficiency.
 *
 * Everything is computed locally from stored attempts/reviews. No telemetry.
 */
import { type IsoDate, todayLocal } from './dates';
import { difficultyScore, estimatedRetention } from './spacedRepetition';
import type {
  AttemptRecord,
  ChallengeProgress,
  ReviewState,
  SessionCompletionRecord,
} from './types';
import { computeItemStats, isLearned, isMastered, reviewBacklog } from './progress';

export interface LearningMetrics {
  totalAttempts: number;
  accuracy: number;
  /** Average seconds per graded exercise (null when no durations recorded). */
  avgSecondsPerExercise: number | null;
  /** Mean estimated FSRS retrievability across reviewed items (0..1). */
  estimatedRetention: number | null;
  /** Items that were failed at least once. */
  failedCards: number;
  /** Failed items whose later attempts were correct. */
  recoveredCards: number;
  recoveryRate: number;
  learnedItems: number;
  masteredItems: number;
  dueToday: number;
  overdue: number;
  meanDifficulty: number | null;
}

export function computeLearningMetrics(
  attempts: AttemptRecord[],
  reviews: Map<string, ReviewState>,
  today: IsoDate = todayLocal(),
): LearningMetrics {
  const stats = computeItemStats(attempts);
  let learned = 0;
  let mastered = 0;
  for (const s of stats.values()) {
    if (isLearned(s)) learned += 1;
    if (isMastered(s, reviews.get(s.itemId))) mastered += 1;
  }

  const correct = attempts.filter((a) => a.correct).length;
  const withDuration = attempts.filter((a) => a.durationMs !== null && a.durationMs > 0);
  const avgSeconds =
    withDuration.length === 0
      ? null
      : Math.round(withDuration.reduce((s, a) => s + (a.durationMs ?? 0), 0) / withDuration.length / 100) / 10;

  const retentions: number[] = [];
  const difficulties: number[] = [];
  for (const r of reviews.values()) {
    const est = estimatedRetention(r, today);
    if (est !== null) retentions.push(est);
    if (r.reviewCount > 0) difficulties.push(difficultyScore(r));
  }

  let failedCards = 0;
  let recoveredCards = 0;
  for (const s of stats.values()) {
    if (s.incorrect > 0) {
      failedCards += 1;
      // Recovered = at least one correct attempt recorded after a failure.
      if (hasRecovery(attempts, s.itemId)) recoveredCards += 1;
    }
  }

  const backlog = reviewBacklog(reviews, today);

  return {
    totalAttempts: attempts.length,
    accuracy: attempts.length === 0 ? 0 : Math.round((correct / attempts.length) * 100),
    avgSecondsPerExercise: avgSeconds,
    estimatedRetention:
      retentions.length === 0
        ? null
        : Math.round((retentions.reduce((s, r) => s + r, 0) / retentions.length) * 100) / 100,
    failedCards,
    recoveredCards,
    recoveryRate: failedCards === 0 ? 0 : Math.round((recoveredCards / failedCards) * 100),
    learnedItems: learned,
    masteredItems: mastered,
    dueToday: backlog.due,
    overdue: backlog.overdue,
    meanDifficulty:
      difficulties.length === 0
        ? null
        : Math.round((difficulties.reduce((s, d) => s + d, 0) / difficulties.length) * 100) / 100,
  };
}

function hasRecovery(attempts: AttemptRecord[], itemId: string): boolean {
  const items = attempts.filter((a) => a.itemId === itemId).sort((a, b) => a.timestamp - b.timestamp);
  let failed = false;
  for (const a of items) {
    if (!a.correct) failed = true;
    else if (failed) return true;
  }
  return false;
}

export interface EngagementMetrics {
  sessionsToday: number;
  sessionsTotal: number;
  minutesToday: number;
  streakDays: number;
  longestStreak: number;
  challengesCompletedToday: number;
  challengesTotal: number;
  exercisesToday: number;
}

export function computeEngagementMetrics(
  attempts: AttemptRecord[],
  completions: SessionCompletionRecord[],
  challenges: ChallengeProgress[],
  streakDays: number,
  longestStreak: number,
  today: IsoDate = todayLocal(),
): EngagementMetrics {
  const todayAttempts = attempts.filter((a) => a.date === today);
  const todayCompletions = completions.filter((c) => c.date === today);
  const msToday = todayCompletions.reduce((s, c) => s + (c.durationMs ?? 0), 0);
  return {
    sessionsToday: todayCompletions.length,
    sessionsTotal: completions.length,
    minutesToday: Math.round(msToday / 60_000),
    streakDays,
    longestStreak,
    challengesCompletedToday: challenges.filter((c) => c.date === today && c.completed).length,
    challengesTotal: challenges.filter((c) => c.completed).length,
    exercisesToday: todayAttempts.length,
  };
}
