/**
 * Date handling + session composition + summary tests.
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildSession,
  computeStreak,
  countsTowardStreak,
  customSessionConfig,
  defaultSessionConfig,
  diffDays,
  answerSessionItem,
  isSessionComplete,
  lastNDates,
  summarizeSession,
  todayLocal,
  type SessionState,
} from '@french-daily/learning-core';
import { irregularVerbIds, sources } from '@french-daily/french-data';

describe('local dates', () => {
  it('formats today as YYYY-MM-DD', () => {
    expect(todayLocal(new Date(2026, 10, 12, 9, 30))).toBe('2026-11-12');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('computes day differences without timezone drift', () => {
    expect(diffDays('2026-11-12', '2026-11-15')).toBe(3);
    expect(diffDays('2026-11-12', '2026-11-12')).toBe(0);
    expect(diffDays('2026-11-15', '2026-11-12')).toBe(-3);
  });

  it('lists the last N dates ending on a given day', () => {
    expect(lastNDates('2026-11-12', 3)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });
});

describe('streak computation', () => {
  it('is zero without completed sessions', () => {
    expect(computeStreak([], '2026-11-12')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-11-10', '2026-11-11', '2026-11-12'], '2026-11-12')).toBe(3);
  });

  it('stays alive when yesterday was the last day', () => {
    expect(computeStreak(['2026-11-10', '2026-11-11'], '2026-11-12')).toBe(2);
  });

  it('breaks after a missed day', () => {
    expect(computeStreak(['2026-11-08', '2026-11-09'], '2026-11-12')).toBe(0);
    expect(computeStreak(['2026-11-09', '2026-11-11'], '2026-11-12')).toBe(1);
  });

  it('ignores duplicate dates', () => {
    expect(computeStreak(['2026-11-11', '2026-11-11', '2026-11-12'], '2026-11-12')).toBe(2);
  });
});

function newSession(): SessionState {
  return buildSession(
    defaultSessionConfig('short'),
    sources,
    new Map(),
    '2026-11-12',
    'seed-1',
  );
}

describe('session composition', () => {
  it('builds the configured number of exercises per section', () => {
    const s = newSession();
    expect(s.items.length).toBe(9); // 3 nouns + 3 verbs + 3 sentences
    expect(s.items.filter((i) => i.section === 'nouns')).toHaveLength(3);
    expect(s.items.filter((i) => i.section === 'verbs')).toHaveLength(3);
    expect(s.items.filter((i) => i.section === 'sentences')).toHaveLength(3);
  });

  it('never repeats the same content item in one session', () => {
    const s = buildSession(defaultSessionConfig('long'), sources, new Map(), '2026-11-12', 'seed-2');
    const ids = s.items.map((i) => i.exercise.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic for a given seed', () => {
    const a = buildSession(defaultSessionConfig('standard'), sources, new Map(), '2026-11-12', 'fixed');
    const b = buildSession(defaultSessionConfig('standard'), sources, new Map(), '2026-11-12', 'fixed');
    expect(a.items.map((i) => i.exercise.id)).toEqual(b.items.map((i) => i.exercise.id));
  });

  it('prioritizes due review items', () => {
    const dueId = 'verb:aller';
    const states = new Map([
      [
        dueId,
        {
          itemId: dueId,
          kind: 'verb' as const,
          status: 'review' as const,
          lastReviewed: '2026-11-01',
          nextDue: '2026-11-01',
          reviewCount: 3,
          correctCount: 2,
          incorrectCount: 1,
          lapseCount: 1,
          reps: 1,
          interval: 1,
          stability: 1,
          difficulty: 8,
          lastRating: 2 as const,
        },
      ],
    ]);
    const s = buildSession(
      { ...defaultSessionConfig('standard'), nouns: 0, sentences: 0, verbs: 5 },
      sources,
      states,
      '2026-11-12',
      'seed-due',
    );
    expect(s.items[0].exercise.itemId).toBe(dueId);
  });
});

describe('answering + retries', () => {
  it('grades answers and schedules retries for failures (max 2)', () => {
    let s = newSession();
    const first = s.items[0];
    const res = answerSessionItem(s, first.exercise.id, 'definitely wrong answer 12345');
    s = res.state;
    expect(res.grade!.isCorrect).toBe(false);
    expect(s.items.filter((i) => i.retry)).toHaveLength(1);

    // Answer the rest of the originals incorrectly too.
    const originals = s.items.filter((i) => !i.retry && !i.answered);
    for (const it of originals) {
      s = answerSessionItem(s, it.exercise.id, 'wrong wrong wrong 4321').state;
    }
    // Answer every retry wrongly: item capped at 2 retries total.
    let guard = 0;
    while (s.items.some((i) => !i.answered) && guard++ < 50) {
      const next = s.items.find((i) => !i.answered)!;
      s = answerSessionItem(s, next.exercise.id, 'still wrong 99999').state;
    }
    const retriesForFirst = s.items.filter((i) => i.retry && i.exercise.itemId === first.exercise.itemId);
    expect(retriesForFirst.length).toBeLessThanOrEqual(2);
    expect(isSessionComplete(s)).toBe(true);
    expect(countsTowardStreak(s)).toBe(true);
  });

  it('summary reports accuracy, weak areas and scheduled reviews', () => {
    let s = newSession();
    // Answer first correctly, second incorrectly.
    const [a, b] = s.items;
    s = answerSessionItem(s, a.exercise.id, a.exercise.expected).state;
    s = answerSessionItem(s, b.exercise.id, 'wrong 4321').state;
    const summary = summarizeSession(s, 3, '2026-11-12');
    expect(summary.correct).toBe(1);
    expect(summary.incorrect).toBe(1);
    expect(summary.accuracy).toBe(50);
    expect(summary.scheduledForReview).toContain(b.exercise.itemId);
    expect(summary.weakAreas.length).toBeGreaterThan(0);
    expect(summary.streakDays).toBe(3);
  });

  it('accepts correct answers and can complete a session', () => {
    let s = newSession();
    for (const item of s.items.filter((i) => !i.answered)) {
      s = answerSessionItem(s, item.exercise.id, item.exercise.expected).state;
    }
    expect(isSessionComplete(s)).toBe(true);
    const summary = summarizeSession(s, 1, '2026-11-12');
    expect(summary.accuracy).toBe(100);
    expect(summary.incorrect).toBe(0);
  });
});

describe('custom sessions', () => {
  it('supports topic and kind filters', () => {
    const config = customSessionConfig({ topics: ['food'], kinds: ['gender-select'], nouns: 2, verbs: 0, sentences: 0 });
    const s = buildSession(config, sources, new Map(), '2026-11-12', 'seed-food');
    expect(s.items.length).toBeGreaterThan(0);
    for (const item of s.items) {
      expect(item.exercise.topic).toBe('food');
      expect(item.exercise.kind).toBe('gender-select');
    }
  });

  it('knows which verbs are irregular (for challenge generation)', () => {
    expect(irregularVerbIds.has('verb:être')).toBe(true);
    expect(irregularVerbIds.has('verb:parler')).toBe(false);
  });
});
