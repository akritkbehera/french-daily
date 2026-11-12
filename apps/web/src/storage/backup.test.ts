/**
 * Backup export/import/reset tests — nothing is silently lost.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSession, defaultSessionConfig, gradeAnswerList, type Exercise, type SessionState } from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { db } from './db';
import { recordAttempt, saveSettings } from './repos';
import { BACKUP_VERSION, exportProgress, importProgress, resetProgress, serializeBackup } from './backup';

async function clearAll() {
  await db.attempts.clear();
  await db.reviews.clear();
  await db.sessions.clear();
  await db.milestones.clear();
  await db.challenges.clear();
  await db.settings.clear();
}

function sampleExercise(): Exercise {
  const session: SessionState = buildSession(defaultSessionConfig('short'), sources, new Map(), '2026-11-12', 'backup-seed');
  return session.items[0].exercise;
}

beforeEach(clearAll);

describe('backup export/import', () => {
  it('round-trips progress through JSON', async () => {
    const ex = sampleExercise();
    const grade = gradeAnswerList(ex.expected, ex.expected, ex.accepted, ex.explanation);
    await recordAttempt({ exercise: ex, response: ex.expected, grade, sessionId: 's1', durationMs: 2500 });
    await saveSettings({ theme: 'dark', dailyGoalMinutes: 15 });

    const backup = await exportProgress();
    expect(backup.app).toBe('french-daily');
    expect(backup.backupVersion).toBe(BACKUP_VERSION);
    expect(backup.reviews).toHaveLength(1);
    expect(backup.attempts).toHaveLength(1);

    const json = serializeBackup(backup);

    // Wipe, then restore.
    await clearAll();
    expect(await db.reviews.count()).toBe(0);

    const result = await importProgress(json);
    expect(result.ok).toBe(true);
    expect(result.restored?.reviews).toBe(1);
    expect(result.restored?.attempts).toBe(1);

    const restored = await db.reviews.get(ex.itemId);
    expect(restored).toBeDefined();
    expect(restored!.reviewCount).toBe(1);
    const settings = await db.settings.get('settings');
    expect(settings?.theme).toBe('dark');
  });

  it('rejects invalid JSON and foreign files with clear errors', async () => {
    const notJson = await importProgress('{nope');
    expect(notJson.ok).toBe(false);
    expect(notJson.error).toContain('valid JSON');

    const foreign = await importProgress(JSON.stringify({ app: 'other', kind: 'x' }));
    expect(foreign.ok).toBe(false);
    expect(foreign.error).toContain('not a French Daily');

    const future = await importProgress(
      JSON.stringify({ app: 'french-daily', kind: 'progress-backup', backupVersion: 999, reviews: [], attempts: [] }),
    );
    expect(future.ok).toBe(false);
    expect(future.error).toContain('Unsupported backup version');
  });

  it('does not modify stored data when import fails', async () => {
    const ex = sampleExercise();
    const grade = gradeAnswerList(ex.expected, ex.expected, ex.accepted, ex.explanation);
    await recordAttempt({ exercise: ex, response: ex.expected, grade, sessionId: 's1', durationMs: 1 });
    const before = await db.attempts.count();
    await importProgress('not json at all');
    expect(await db.attempts.count()).toBe(before);
  });
});

describe('reset', () => {
  it('clears progress but keeps settings by default', async () => {
    const ex = sampleExercise();
    const grade = gradeAnswerList(ex.expected, ex.expected, ex.accepted, ex.explanation);
    await recordAttempt({ exercise: ex, response: ex.expected, grade, sessionId: 's1', durationMs: 1 });
    await saveSettings({ theme: 'dark' });

    await resetProgress(false);
    expect(await db.attempts.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
    const settings = await db.settings.get('settings');
    expect(settings?.theme).toBe('dark');
    expect(settings?.streak).toBe(0);
  });

  it('can clear everything including settings', async () => {
    await saveSettings({ theme: 'dark' });
    await resetProgress(true);
    expect(await db.settings.count()).toBe(0);
  });
});
