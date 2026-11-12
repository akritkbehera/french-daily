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
  type FsrsRating,
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
import { requestSessionSync } from '../sync/events';
import { eventId } from '../sync/identity';
import { DEFAULT_SETTINGS, db, type ChallengeRow } from './db';

/* ---------------- settings ---------------- */

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), id: 'settings' };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch, updatedAt: Date.now(), id: 'settings' as const };
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
  rating?: FsrsRating;
}

export interface RecordAttemptResult {
  attemptId: number | null;
  eventId: string;
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
    eventId: crypto.randomUUID(),
    itemId: exercise.id,
    contentId: exercise.itemId,
    kind: exercise.reviewKind,
    exerciseKind: exercise.kind,
    date: today,
    timestamp: Date.now(),
    response: input.response,
    outcome: grade.outcome,
    correct: grade.isCorrect,
    sessionId: input.sessionId,
    durationMs: input.durationMs,
    rating: input.rating ?? (grade.isCorrect ? 3 : grade.outcome === 'typo' || grade.outcome === 'accent' ? 2 : 1),
  };
  const settings = await getSettings();
  const result = await db.transaction('rw', [db.attempts, db.reviews], async () => {
    const existing = (await db.reviews.get(exercise.id)) ?? initialReviewState(exercise.id, exercise.reviewKind, today);
    const updated = { ...applyReview(existing, grade, today, settings.desiredRetention, input.rating), contentId: exercise.itemId, exercise };
    const attemptId = (await db.attempts.add(attempt)) as number;
    await db.reviews.put(updated);
    return { attemptId, eventId: attempt.eventId!, reviewState: updated };
  });
  // Derived projections must never turn an already committed review into a failed save.
  await refreshTodaysChallenges().catch(() => undefined);
  return result;
}

/* ---------------- sessions & streaks ---------------- */

/** Persist a completed session and update the streak. Partial sessions never reach here. */
export async function recordSessionCompletion(
  summary: SessionSummary,
  mode: SessionCompletionRecord['mode'],
  durationMs: number | null,
  sessionId?: string,
): Promise<{ streak: number; longestStreak: number }> {
  const today = todayLocal();
  const record: SessionCompletionRecord = {
    syncId: crypto.randomUUID(),
    sessionId: sessionId ?? `${today}-${Date.now().toString(36)}`,
    mode,
    date: today,
    timestamp: Date.now(),
    total: summary.total,
    correct: summary.correct,
    incorrect: summary.incorrect,
    accuracy: summary.accuracy,
    durationMs,
  };
  await db.transaction('rw', db.sessions, async () => {
    if (!(await db.sessions.where('sessionId').equals(record.sessionId).first())) await db.sessions.add(record);
  });

  const settings = await getSettings();
  const completions = await db.sessions.orderBy('date').uniqueKeys();
  const dates = completions as string[];
  let streak = computeStreak(dates, today);
  if (!settings.streaksEnabled) streak = 0;
  const longestStreak = Math.max(settings.longestStreak, streak);
  await saveSettings({ streak, longestStreak, lastCompletionDate: today });
  await refreshTodaysChallenges();
  requestSessionSync();
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
  const refreshed = refreshChallenges(rows, ctx).map((c) => ({ ...c, id: `${c.date}::${c.def.id}` }));
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

/** Restore the exact review and its log in one transaction. */
export async function undoAttempt(attemptId: number, cardId: string, previous: ReviewState | null, sessionId: string, stableEventId?: string): Promise<void> {
  const settingsBefore = await getSettings();
  await db.transaction('rw', [db.attempts, db.reviews, db.sessions, db.tombstones], async () => {
    const attempt = stableEventId ? await db.attempts.filter(a => eventId(a) === stableEventId).first() : await db.attempts.get(attemptId);
    if (attempt) await db.tombstones.put({ id: eventId(attempt) });
    for (const completion of await db.sessions.where('sessionId').equals(sessionId).toArray()) await db.tombstones.put({ id: `session:${completion.syncId ?? sessionId}` });
    if (!attempt?.id) throw new Error('This review no longer exists.');
    await db.attempts.delete(attempt.id);
    const remaining = (await db.attempts.where('itemId').equals(cardId).toArray()).sort((a,b) => a.timestamp - b.timestamp || eventId(a).localeCompare(eventId(b)));
    if (remaining.length) {
      const metadata = await db.reviews.get(cardId);
      let state = initialReviewState(cardId, remaining[0].kind, remaining[0].date);
      for (const a of remaining) state = applyReview(state, { outcome: a.outcome, given: a.response, expected: '', isCorrect: a.correct, isTypo: false, feedback: '', explanation: '' }, a.date, settingsBefore.desiredRetention, a.rating);
      await db.reviews.put({ ...state, contentId: metadata?.contentId, exercise: metadata?.exercise });
    } else if (previous) await db.reviews.put(previous); else await db.reviews.delete(cardId);
    await db.sessions.where('sessionId').equals(sessionId).delete();
  });
  const settings = await getSettings();
  const dates = await db.sessions.orderBy('date').uniqueKeys();
  await saveSettings({ streak: settings.streaksEnabled ? computeStreak(dates as string[]) : 0 });
  await refreshTodaysChallenges().catch(() => undefined);
  requestSessionSync();
}
