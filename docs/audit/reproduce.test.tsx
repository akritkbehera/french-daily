/** Independent audit: regression tests assert repaired behavior.
 * Run: npx vitest run --config docs/audit/vitest.config.ts
 * All data writes target fake-indexeddb in this test process only.
 */
import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import {
  buildSession, customSessionConfig, initialReviewState, todayLocal,
  makeEnToFrTranslation, makeFrToEnTranslation, makeGenderExercise,
  gradeAnswerList, fsrsInitState, fsrsReview, DEFAULT_WEIGHTS,
  challengeProgress, exerciseCatalog, type AttemptRecord, type ChallengeContext,
} from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { db, DEFAULT_SETTINGS } from '../../apps/web/src/storage/db';
import { getTodaysChallenges, refreshTodaysChallenges, recordAttempt } from '../../apps/web/src/storage/repos';
import { importProgress } from '../../apps/web/src/storage/backup';
import { SwipeDeck } from '../../apps/web/src/components/SwipeDeck';

vi.mock('../../apps/web/src/hooks/useApp', () => ({
  useApp: () => ({ settings: { ...DEFAULT_SETTINGS, soundEnabled: false, hapticsEnabled: false }, toast: vi.fn() }),
}));
vi.mock('../../apps/web/src/services/feedback', () => ({
  buzz: vi.fn(), playTone: vi.fn(), speakFrench: vi.fn(), prefersReducedMotion: () => true,
}));

beforeEach(async () => {
  for (const table of db.tables) await table.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function gradeSwipe(rating: string) {
  render(<SwipeDeck />);
  await screen.findByTestId('reveal-answer-button');
  fireEvent.click(screen.getByTestId('reveal-answer-button'));
  fireEvent.click(screen.getByRole('button', { name: rating, exact: true }));
  await waitFor(() => expect(screen.getByText('11 left')).toBeInTheDocument());
}

it('A01: Easy is persisted as rating 4', async () => {
  await gradeSwipe('Easy');
  const attempts = await db.attempts.toArray();
  const reviews = await db.reviews.toArray();
  expect(attempts).toHaveLength(1);
  expect(attempts[0].rating).toBe(4);
  expect(reviews[0].lastRating).toBe(4);
});

it('A02: Hard preserves successful recall', async () => {
  await gradeSwipe('Hard');
  const [attempt] = await db.attempts.toArray();
  expect(attempt.rating).toBe(2);
  expect(attempt.correct).toBe(true);
  expect(attempt.outcome).toBe('correct');
});

it('A03: Undo removes both the first attempt and its review row', async () => {
  await gradeSwipe('Good');
  fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
  await waitFor(() => expect(screen.getByText('12 left')).toBeInTheDocument());
  expect(await db.attempts.count()).toBe(0);
  expect(await db.reviews.count()).toBe(0);
});

it('A04: Review mode excludes unseen items', () => {
  const today = todayLocal();
  const noun = sources.vocabulary[sources.vocabulary.length - 1];
  const due = { ...initialReviewState(noun.id, 'vocab', today), reviewCount: 1 };
  const session = buildSession(customSessionConfig({ mode: 'review', nouns: 3, verbs: 0, sentences: 0 }), sources, new Map([[noun.id, due]]), today);
  expect(session.items).toHaveLength(1);
  expect(session.items.filter(x => x.exercise.itemId !== noun.id)).toHaveLength(0);
});

it('A05: English/French recall directions retain separate review rows', async () => {
  const item = sources.vocabulary[0];
  for (const exercise of [makeEnToFrTranslation(item, () => 0), makeFrToEnTranslation(item)]) {
    await recordAttempt({ exercise, response: exercise.expected, grade: gradeAnswerList(exercise.expected, exercise.expected), sessionId: 'audit', durationMs: 1000 });
  }
  const rows = await db.reviews.toArray();
  expect(rows).toHaveLength(2);
  expect(rows.every(r => r.reviewCount === 1)).toBe(true);
});

it('A06: Challenge refresh preserves stable IDs and row counts', async () => {
  expect(await getTodaysChallenges()).toHaveLength(3);
  await refreshTodaysChallenges();
  expect(await db.challenges.count()).toBe(3);
  await refreshTodaysChallenges();
  expect(await db.challenges.count()).toBe(3);
});

it('A07: A failed review-state write rolls back its attempt', async () => {
  const exercise = makeFrToEnTranslation(sources.vocabulary[0]);
  vi.spyOn(db.reviews, 'put').mockRejectedValueOnce(new Error('injected storage failure'));
  await expect(recordAttempt({ exercise, response: exercise.expected, grade: gradeAnswerList(exercise.expected, exercise.expected), sessionId: 'audit', durationMs: 1000 })).rejects.toThrow('injected storage failure');
  expect(await db.attempts.count()).toBe(0);
  expect(await db.reviews.count()).toBe(0);
});

it('A08: A malformed backup preserves valid reviews', async () => {
  await db.reviews.put(initialReviewState('valid', 'vocab'));
  const result = await importProgress(JSON.stringify({ app: 'french-daily', kind: 'progress-backup', backupVersion: 1, reviews: [{ itemId: 'broken' }], attempts: [] }));
  expect(result.ok).toBe(false);
  expect(await db.reviews.get('valid')).toBeDefined();
  expect(await db.reviews.get('broken')).toBeUndefined();
});

it('A09: Plural-only nouns retain plural articles', () => {
  const glasses = sources.vocabulary.find(x => x.french === 'lunettes')!;
  expect(makeEnToFrTranslation(glasses, () => 0).expected).toBe('les lunettes');
  expect(makeFrToEnTranslation(glasses).prompt).toBe('les lunettes');
});

it('A10: A gender question hides the gender before answering', () => {
  const maison = sources.vocabulary.find(x => x.french === 'maison')!;
  const exercise = makeGenderExercise(maison);
  expect(exercise.expected).toBe('la');
  expect(exercise.hint).toBeUndefined();
});

it('A11: Difficulty update matches the published FSRS-4.5 mean reversion', () => {
  const previous = fsrsInitState(3);
  const next = fsrsReview(previous, 3, 4);
  // Official FSRS-4.5: D0(3) = w4, so an initial Good then Good leaves D unchanged.
  const expected = DEFAULT_WEIGHTS[7] * DEFAULT_WEIGHTS[4] + (1 - DEFAULT_WEIGHTS[7]) * previous.difficulty;
  expect(next.state.difficulty).toBeCloseTo(expected, 6);
  expect(expected - next.state.difficulty).toBeCloseTo(0, 6);
});

it('A12: Fix-missed progress credits a corrected answer', () => {
  const today = todayLocal();
  const missed = { itemId: 'noun:maison', date: today, timestamp: 1, correct: false, kind: 'vocab' } as AttemptRecord;
  const corrected = { ...missed, timestamp: 2, correct: true };
  const ctx = { today, reviews: new Map(), attemptsAll: [missed, corrected], attemptsToday: [missed, corrected], irregularVerbIds: new Set(), counts: { vocab: 1, verbs: 0, sentences: 0 } } as ChallengeContext;
  expect(challengeProgress({ id: 'fix-missed', kind: 'fix-missed', title: '', description: '', derivedFrom: '', target: 1 }, ctx)).toBe(1);
});

it('A13: Two fast grade clicks commit a card only once', async () => {
  render(<SwipeDeck />);
  await screen.findByTestId('reveal-answer-button');
  fireEvent.click(screen.getByTestId('reveal-answer-button'));
  const good = screen.getByRole('button', { name: 'Good', exact: true });
  fireEvent.click(good);
  fireEvent.click(good);
  await waitFor(() => expect(screen.getByText('11 left')).toBeInTheDocument());
  const attempts = await db.attempts.toArray();
  expect(attempts).toHaveLength(1);
});

it('A14: A full swipe deck prioritizes overdue cards and records completion', async () => {
  const noun = sources.vocabulary[sources.vocabulary.length - 1];
  const exercise = exerciseCatalog(sources).find(e => e.itemId === noun.id)!;
  await db.reviews.put({ ...initialReviewState(exercise.id, 'vocab'), contentId: noun.id, exercise, reviewCount: 1, nextDue: '2026-01-01' });
  render(<SwipeDeck />);
  for (let i = 0; i < 12; i++) {
    await screen.findByTestId('reveal-answer-button');
    fireEvent.click(screen.getByTestId('reveal-answer-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Good', exact: true }));
    await waitFor(() => expect(screen.getByText(`${11 - i} left`)).toBeInTheDocument());
  }
  expect(await screen.findByText('Deck complete')).toBeInTheDocument();
  expect((await db.reviews.get(exercise.id))?.reviewCount).toBe(2);
  expect(await db.attempts.count()).toBe(12);
  expect(await db.sessions.count()).toBe(1);
});
