/**
 * Typed repositories over Dexie. All writes go through these functions so the
 * learning engine stays pure and persistence stays auditable.
 */
import {
  applyReview,
  computeStreak,
  gradeAnswerList,
  initialReviewState,
  todayLocal,
  type AppSettings,
  type AttemptRecord,
  type ChallengeProgress,
  type Exercise,
  type GradeResult,
  type MilestoneRecord,
  type ReviewState,
  type SessionCompletionRecord,
  type SessionSummary,
} from '@french-daily/learning-core';
import { generateChallenges, refreshChallenges, type ChallengeContext } from '@french-daily/learning-core';
import { irregularVerbIds, sources } from '@french-daily/french-data';
import { DEFAULT_SETTINGS, db, type ChallengeRow } from './db';

/* ---------------- settings ---------------- */

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), id: 'settings' };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch, id: 'settings' as const };
  await db.settings.put(next);
  return next;
}

/* ---------------- reviews & attempts ---------------- */

export async function getReviewStates(): Promise<Map<string, ReviewState>> {
  const rows = await db.reviews.toArray();
  return new Map(rows.map((r) => [r.itemId, r]));
}

export interface RecordAttemptInput {
  exercise: Exercise;
  response: string;
  grade: GradeResult;
  sessionId: string;
  durationMs: number | null;
}

export interface RecordAttemptResult {
  attemptId: number | null;
  reviewState: ReviewState;
}

/**
 * Record one graded attempt: persists the attempt log, advances the FSRS
 * review state, and refreshes today's challenge progress.
 */
export async function recordAttempt(input: RecordAttemptInput): Promise<RecordAttemptResult> {
  const today = todayLocal();
  const { exercise, grade } = input;

  const attempt: AttemptRecord = {
    itemId: exercise.itemId,
    kind: exercise.reviewKind,
    exerciseKind: exercise.kind,
    date: today,
    timestamp: Date.now(),
    response: input.response,
    outcome: grade.outcome,
    correct: grade.isCorrect,
    sessionId: input.sessionId,
    durationMs: input.durationMs,
    rating: grade.isCorrect ? 3 : grade.outcome === 'typo' || grade.outcome === 'accent' ? 2 : 1,
  };
  const attemptId = (await db.attempts.add(attempt)) as number;

  const existing = (await db.reviews.get(exercise.itemId)) ?? initialReviewState(exercise.itemId, exercise.reviewKind, today);
  const settings = await getSettings();
  const updated = applyReview(existing, grade, today, settings.desiredRetention);
  await db.reviews.put(updated);
  await refreshTodaysChallenges();
  return { attemptId, reviewState: updated };
}

/* ---------------- sessions & streaks ---------------- */

/** Persist a completed session and update the streak. Partial sessions never reach here. */
export async function recordSessionCompletion(
  summary: SessionSummary,
  mode: SessionCompletionRecord['mode'],
  durationMs: number | null,
): Promise<{ streak: number; longestStreak: number }> {
  const today = todayLocal();
  const record: SessionCompletionRecord = {
    sessionId: `${today}-${Date.now().toString(36)}`,
    mode,
    date: today,
    timestamp: Date.now(),
    total: summary.total,
    correct: summary.correct,
    incorrect: summary.incorrect,
    accuracy: summary.accuracy,
    durationMs,
  };
  await db.sessions.add(record);

  const settings = await getSettings();
  const completions = await db.sessions.orderBy('date').uniqueKeys();
  const dates = completions as string[];
  let streak = computeStreak(dates, today);
  if (!settings.streaksEnabled) streak = 0;
  const longestStreak = Math.max(settings.longestStreak, streak);
  await saveSettings({ streak, longestStreak, lastCompletionDate: today });
  await refreshTodaysChallenges();
  return { streak, longestStreak };
}

export async function listSessions(): Promise<SessionCompletionRecord[]> {
  return db.sessions.toArray();
}

export async function listAttempts(): Promise<AttemptRecord[]> {
  return db.attempts.toArray();
}

/* ---------------- daily challenges ---------------- */

export async function challengeContext(today = todayLocal()): Promise<ChallengeContext> {
  const attempts = await db.attempts.toArray();
  const reviews = await getReviewStates();
  return {
    today,
    reviews,
    attemptsToday: attempts.filter((a) => a.date === today),
    attemptsAll: attempts,
    irregularVerbIds,
    counts: {
      vocab: sources.vocabulary.length,
      verbs: sources.verbs.length,
      sentences: sources.sentences.length,
    },
  };
}

/** Generate today's challenges if missing; always return them fresh. */
export async function getTodaysChallenges(): Promise<ChallengeProgress[]> {
  const today = todayLocal();
  const rows = await db.challenges.where('date').equals(today).toArray();
  const ctx = await challengeContext(today);
  if (rows.length === 0) {
    const generated = generateChallenges(ctx);
    const stored: ChallengeRow[] = generated.map((c) => ({ ...c, id: `${today}::${c.id}` }));
    await db.challenges.bulkPut(stored);
    return stored;
  }
  return rows;
}

export async function refreshTodaysChallenges(): Promise<ChallengeProgress[]> {
  const today = todayLocal();
  const rows = await db.challenges.where('date').equals(today).toArray();
  if (rows.length === 0) return getTodaysChallenges();
  const ctx = await challengeContext(today);
  const refreshed = refreshChallenges(rows, ctx).map((c) => ({ ...c, id: `${c.date}::${c.id}` }));
  await db.challenges.bulkPut(refreshed as ChallengeRow[]);
  return refreshed;
}

export async function listAllChallenges(): Promise<ChallengeProgress[]> {
  return db.challenges.toArray();
}

/* ---------------- milestones ---------------- */

export interface MilestoneCheckInput {
  masteredVocab: number;
  masteredVerbs: number;
  reviewsTotal: number;
  streakDays: number;
  bestDailyAccuracy: number;
  recoveredCards: number;
}

/**
 * Evaluate milestone thresholds and persist newly reached ones.
 * Milestones are always about learning outcomes — never swipe counts or XP.
 */
export async function checkMilestones(input: MilestoneCheckInput): Promise<MilestoneRecord[]> {
  const today = todayLocal();
  const existing = await db.milestones.toArray();
  const seen = new Set(existing.map((m) => `${m.kind}:${m.value}`));
  const candidates: Array<Omit<MilestoneRecord, 'id'>> = [];

  const push = (kind: MilestoneRecord['kind'], value: number, label: string) => {
    if (value > 0 && !seen.has(`${kind}:${value}`)) candidates.push({ kind, label, achievedAt: Date.now(), date: today, value });
  };

  for (const m of [10, 25, 50, 100]) {
    if (input.masteredVocab >= m) push('vocab-mastered', m, `${m} words mastered`);
    if (input.masteredVerbs >= m) push('verbs-mastered', m, `${m} verbs mastered`);
  }
  for (const m of [100, 500, 1000]) {
    if (input.reviewsTotal >= m) push('reviews-total', m, `${m} reviews completed`);
  }
  for (const m of [3, 7, 14, 30]) {
    if (input.streakDays >= m) push('weekly-consistency', m, `${m}-day practice streak`);
  }
  for (const m of [5, 20, 50]) {
    if (input.recoveredCards >= m) push('recovery', m, `${m} difficult items recovered`);
  }
  for (const m of [80, 90, 95]) {
    if (input.bestDailyAccuracy >= m) push('accuracy-record', m, `${m}% accuracy in one session`);
  }

  if (candidates.length === 0) return [];
  const added: MilestoneRecord[] = [];
  for (const c of candidates) {
    added.push({ ...c, id: await db.milestones.add(c as MilestoneRecord) as number });
  }
  return added;
}

export async function listMilestones(): Promise<MilestoneRecord[]> {
  return db.milestones.orderBy('achievedAt').reverse().toArray();
}

/* ---------------- grading helper used by the swipe deck ---------------- */

/** Grade a self-reported swipe answer against the exercise's expected answer. */
export function gradeSwipe(exercise: Exercise, known: boolean): GradeResult {
  return gradeAnswerList(known ? exercise.expected : '(skipped)', exercise.expected, exercise.accepted, exercise.explanation);
}
