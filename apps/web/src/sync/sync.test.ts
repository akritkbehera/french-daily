import { beforeEach, expect, it } from 'vitest';
import { makeEnToFrTranslation, gradeAnswerList } from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { db, DEFAULT_SETTINGS } from '../storage/db';
import { recordAttempt, undoAttempt } from '../storage/repos';
import { mergeProgress, type SyncDocument } from './merge';
import { readLocalProgress, syncProgress } from './service';

const exercise = makeEnToFrTranslation(sources.vocabulary[0], () => 0);
const empty = (): SyncDocument => ({ app: 'french-daily', kind: 'progress-backup', backupVersion: 2, syncVersion: 1, exportedAt: new Date().toISOString(), settings: DEFAULT_SETTINGS, attempts: [], reviews: [], sessions: [], milestones: [], challenges: [], deletedEvents: [] });
const event = (id: string, timestamp: number) => ({ eventId: id, itemId: exercise.id, contentId: exercise.itemId, kind: exercise.reviewKind, exerciseKind: exercise.kind, date: '2026-11-12', timestamp, response: exercise.expected, outcome: 'correct' as const, correct: true, sessionId: id, durationMs: 1000, rating: 3 as const });
async function review() { return recordAttempt({ exercise, response: exercise.expected, grade: gradeAnswerList(exercise.expected, exercise.expected), sessionId: crypto.randomUUID(), durationMs: 1000 }); }
beforeEach(async () => { for (const table of db.tables) await table.clear(); });

it('merges phone/laptop event logs, deduplicates repeated sync and replays FSRS', () => {
  const a = { ...empty(), attempts: [event('a', 10)] };
  const b = { ...empty(), attempts: [event('b', 20)] };
  const merged = mergeProgress(a, b);
  expect(merged.attempts.map(x => x.eventId)).toEqual(['a','b']);
  expect(merged.reviews[0].reviewCount).toBe(2);
  expect(mergeProgress(merged, b).attempts).toHaveLength(2);
  expect(mergeProgress(b, a).reviews).toEqual(merged.reviews);
});
it('never resurrects undone events or deleted completed sessions', () => {
  const remote = { ...empty(), attempts: [event('gone', 10)], sessions: [{ sessionId: 's', mode: 'daily' as const, date: '2026-11-12', timestamp: 10, total: 1, correct: 1, incorrect: 0, accuracy: 100, durationMs: 1 }] };
  const merged = mergeProgress({ ...empty(), deletedEvents: ['gone','session:s'] }, remote);
  expect(merged.attempts).toHaveLength(0); expect(merged.reviews).toHaveLength(0); expect(merged.sessions).toHaveLength(0);
});
it('local numeric database IDs do not collide across devices', () => {
  const merged = mergeProgress({ ...empty(), attempts: [{ ...event('a', 10), id: 1 }] }, { ...empty(), attempts: [{ ...event('b', 20), id: 1 }] });
  expect(merged.attempts).toHaveLength(2); expect(merged.attempts.every(a => a.id === undefined)).toBe(true);
});
it('retries a SHA conflict and merges the intervening remote event', async () => {
  await review(); let gets = 0; let saved: SyncDocument | null = null;
  await syncProgress(async (_path, init) => {
    if (init?.method === 'PUT') {
      if (gets === 1) return new Response('{}', { status: 409 });
      saved = JSON.parse(init.body as string).data; return Response.json({ ok: true });
    }
    gets++;
    return Response.json({ sha: `sha-${gets}`, data: gets === 1 ? null : { ...empty(), attempts: [event('other-device', 10)] } });
  });
  expect(gets).toBe(2); expect(saved!.attempts).toHaveLength(2); expect(await db.attempts.count()).toBe(2);
});
it('preserves a review added while an upload is in flight', async () => {
  await review(); let uploaded: SyncDocument | null = null; let writes = 0;
  await syncProgress(async (_path, init) => {
    if (init?.method === 'PUT') {
      uploaded = JSON.parse(init.body as string).data; writes++;
      if (writes === 1) await review();
      return Response.json({ ok: true });
    }
    return Response.json({ sha: uploaded ? 'sha' : null, data: uploaded });
  });
  expect(writes).toBe(2); expect(uploaded!.attempts).toHaveLength(2); expect(await db.attempts.count()).toBe(2);
});
it('leaves local data intact after malformed remote JSON or network failure', async () => {
  await review(); const original = await db.attempts.toArray();
  await expect(syncProgress(async () => Response.json({ sha: 'x', data: { ...empty(), attempts: [{}] } }))).rejects.toThrow();
  expect(await db.attempts.toArray()).toEqual(original);
  await expect(syncProgress(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  expect(await db.attempts.toArray()).toEqual(original);
});
it('undo writes a sync tombstone in the same transaction', async () => {
  const result = await review(); const [attempt] = await db.attempts.toArray();
  await undoAttempt(result.attemptId!, exercise.id, null, attempt.sessionId);
  const progress = await readLocalProgress();
  expect(progress.deletedEvents).toContain(attempt.eventId); expect(progress.attempts).toHaveLength(0);
});

it('undo uses the stable event ID even when sync reassigns local database IDs', async () => {
  const result = await review();
  await syncProgress(async (_path, init) => init?.method === 'PUT' ? Response.json({ ok: true }) : Response.json({ sha: null, data: null }));
  const [reinserted] = await db.attempts.toArray();
  expect(reinserted.id).not.toBe(result.attemptId);
  await undoAttempt(result.attemptId!, exercise.id, null, reinserted.sessionId, result.eventId);
  expect(await db.attempts.count()).toBe(0);
  expect((await readLocalProgress()).deletedEvents).toContain(result.eventId);
});
