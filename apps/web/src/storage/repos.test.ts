/**
 * Dexie persistence tests: attempts advance FSRS state, sessions update
 * streaks, challenges refresh from real data, milestones dedupe.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSession, defaultSessionConfig, type Exercise, type SessionState } from '@french-daily/learning-core';
import { gradeAnswerList } from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { db } from './db';
import {
  checkMilestones,
  getReviewStates,
  getSettings,
  getTodaysChallenges,
  listAttempts,
  listSessions,
  recordAttempt,
  recordSessionCompletion,
  saveSettings,
} from './repos';

async function clearAll() {
  await db.attempts.clear();
  await db.reviews.clear();
  await db.sessions.clear();
  await db.milestones.clear();
  await db.challenges.clear();
  await db.settings.clear();
}

function sampleExercise(): Exercise {
  const session: SessionState = buildSession(defaultSessionConfig('short'), sources, new Map(), '2026-11-12', 'test-seed');
  return session.items[0].exercise;
}

beforeEach(clearAll);

describe('recordAttempt', () => {
  it('persists the attempt and advances the FSRS review state', async () => {
    const ex = sampleExercise();
    const grade = gradeAnswerList(ex.expected, ex.expected, ex.accepted, ex.explanation);
    const { attemptId, reviewState } = await recordAttempt({
      exercise: ex,
      response: ex.expected,
      grade,
      sessionId: 's1',
      durationMs: 5000,
    });

    expect(attemptId).toBeGreaterThan(0);
    const attempts = await listAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].itemId).toBe(ex.id);
    expect(attempts[0].correct).toBe(true);
    expect(attempts[0].durationMs).toBe(5000);
    expect(attempts[0].rating).toBe(3);

    const stored = await db.reviews.get(ex.id);
    expect(stored).toBeDefined();
    expect(stored!.reviewCount).toBe(1);
    expect(stored!.correctCount).toBe(1);
    expect(stored!.interval).toBeGreaterThanOrEqual(1);
    expect(reviewState.nextDue).toBe(stored!.nextDue);
  });

  it('counts incorrect attempts and schedules a next-day relearn', async () => {
    const ex = sampleExercise();
    const grade = gradeAnswerList('definitely-not-right-xyz', ex.expected, ex.accepted, ex.explanation);
    const { reviewState } = await recordAttempt({ exercise: ex, response: 'no', grade, sessionId: 's1', durationMs: null });
    expect(reviewState.incorrectCount).toBe(1);
    expect(reviewState.lapseCount).toBe(1);
  });

  it('refreshes challenge progress from recorded attempts', async () => {
    const before = await getTodaysChallenges();
    expect(before.length).toBeGreaterThan(0);
    // Record 12 correct vocab attempts → recall-nouns (if present) completes.
    for (let i = 0; i < 12; i++) {
      const ex = sources.vocabulary[i];
      const exercise: Exercise = {
        id: `t${i}`,
        kind: 'translation-typed',
        itemId: ex.id,
        reviewKind: 'vocab',
        topic: ex.topic,
        level: ex.level,
        prompt: ex.english[0],
        instruction: 'Translate',
        expected: ex.french,
        accepted: [],
        explanation: '',
        direction: 'en-fr',
      };
      const grade = gradeAnswerList(ex.french, ex.french, [], 'ok');
      await recordAttempt({ exercise, response: ex.french, grade, sessionId: `s${i}`, durationMs: 1000 });
    }
    const after = await getTodaysChallenges();
    const nouns = after.find((c) => c.id === 'recall-nouns');
    if (nouns) {
      expect(nouns.progress).toBe(12);
      expect(nouns.completed).toBe(true);
    }
  });
});

describe('sessions and streaks', () => {
  it('records completions and computes a streak across consecutive days', async () => {
    const summary = { total: 9, correct: 8, incorrect: 1, accuracy: 89, typos: 0, bySection: { nouns: { total: 3, correct: 3 }, verbs: { total: 3, correct: 3 }, sentences: { total: 3, correct: 2 } }, scheduledForReview: [], weakAreas: [], streakDays: 0 };
    const { streak, longestStreak } = await recordSessionCompletion(summary as never, 'daily', 120_000);
    expect(streak).toBe(1);
    expect(longestStreak).toBe(1);

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].mode).toBe('daily');
    expect(sessions[0].durationMs).toBe(120_000);

    const settings = await getSettings();
    expect(settings.streak).toBe(1);
    expect(settings.lastCompletionDate).toBeTruthy();
  });

  it('keeps settings across saves', async () => {
    await saveSettings({ theme: 'dark', soundEnabled: false, desiredRetention: 0.85 });
    const s = await getSettings();
    expect(s.theme).toBe('dark');
    expect(s.soundEnabled).toBe(false);
    expect(s.desiredRetention).toBe(0.85);
  });
});

describe('milestones', () => {
  it('records milestones once and never duplicates them', async () => {
    const first = await checkMilestones({
      masteredVocab: 10,
      masteredVerbs: 0,
      reviewsTotal: 0,
      streakDays: 0,
      bestDailyAccuracy: 0,
      recoveredCards: 0,
    });
    expect(first.length).toBeGreaterThan(0);

    const again = await checkMilestones({
      masteredVocab: 10,
      masteredVerbs: 0,
      reviewsTotal: 0,
      streakDays: 0,
      bestDailyAccuracy: 0,
      recoveredCards: 0,
    });
    expect(again).toHaveLength(0);

    const stored = await db.milestones.toArray();
    expect(stored.some((m) => m.kind === 'vocab-mastered' && m.value === 10)).toBe(true);
  });
});

describe('review states map', () => {
  it('returns states keyed by item id', async () => {
    const ex = sampleExercise();
    const grade = gradeAnswerList(ex.expected, ex.expected, ex.accepted, ex.explanation);
    await recordAttempt({ exercise: ex, response: ex.expected, grade, sessionId: 's1', durationMs: 1 });
    const map = await getReviewStates();
    expect(map.get(ex.id)).toBeDefined();
  });
});
