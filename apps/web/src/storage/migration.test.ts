import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { initialReviewState } from '@french-daily/learning-core';
import { FrenchDailyDb, normalizeHistory } from './db';

it('migrates a real version-1 database without losing history and retains a raw recovery snapshot', async () => {
  const name = `migration-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(1).stores({ attempts: '++id, itemId, date, timestamp, sessionId, kind', reviews: 'itemId, nextDue, kind, status, difficulty', sessions: '++id, sessionId, date, timestamp, mode', milestones: '++id, kind, date', challenges: 'id, date', settings: 'id' });
  const review = { ...initialReviewState('noun:maison', 'vocab'), reviewCount: 2, interval: 4, stability: 3.71 };
  await old.table('reviews').put(review);
  old.close();
  const upgraded = new FrenchDailyDb(name);
  const reviews = await upgraded.reviews.toArray();
  expect(reviews).toHaveLength(1);
  expect(reviews[0].itemId).toContain('noun:maison::');
  expect(reviews[0].reviewCount).toBe(2);
  expect(reviews[0].interval).toBe(4);
  const snapshot = await upgraded.snapshots.toArray();
  expect(snapshot).toHaveLength(1);
  expect((snapshot[0].data as { reviews: unknown[] }).reviews).toEqual([review]);
  await upgraded.delete();
});
it('does not copy legacy mastery to multiple recall directions', () => {
  const history = normalizeHistory([initialReviewState('noun:maison', 'vocab')], []);
  expect(history.reviews).toHaveLength(1);
  expect(history.reviews[0].exercise?.id).toBe(history.reviews[0].itemId);
});
