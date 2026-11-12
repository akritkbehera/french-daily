import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { initialReviewState, makeFrToEnTranslation, gradeAnswerList } from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { db, DEFAULT_SETTINGS } from '../storage/db';
import { recordAttempt } from '../storage/repos';
import { ReviewScreen } from '../screens/ReviewScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
vi.mock('../hooks/useApp', () => ({ useApp: () => ({ settings: DEFAULT_SETTINGS, startReviewSession: vi.fn() }) }));
beforeEach(async () => { for (const table of db.tables) await table.clear(); });
afterEach(cleanup);
it('updates the review screen after synchronized schedules change', async () => {
  render(<ReviewScreen />);
  expect(await screen.findByText('No review history yet')).toBeInTheDocument();
  await act(async () => { await db.reviews.put(initialReviewState('noun:maison::translation-typed::def', 'vocab')); });
  expect(await screen.findByRole('heading', { name: 'Due now' })).toBeInTheDocument();
});
it('updates progress without navigating away after new review events arrive', async () => {
  render(<ProgressScreen />);
  expect(await screen.findByText('0 answers')).toBeInTheDocument();
  const exercise = makeFrToEnTranslation(sources.vocabulary[0]);
  await act(async () => { await recordAttempt({ exercise, response: exercise.expected, grade: gradeAnswerList(exercise.expected, exercise.expected), sessionId: 'screen-sync-test', durationMs: 1 }); });
  expect(await screen.findByText('1 answer')).toBeInTheDocument();
});
