/**
 * Backup, restore, and reset.
 *
 * Export produces a versioned JSON snapshot of user progress only (never the
 * learning content, which ships with the app). Import validates the payload
 * and restores it atomically. Reset clears progress but keeps settings unless
 * asked otherwise. Nothing is ever silently discarded.
 */
import type { AppSettings, ReviewState, SessionCompletionRecord, AttemptRecord, MilestoneRecord } from '@french-daily/learning-core';
import { todayLocal } from '@french-daily/learning-core';
import { db, type ChallengeRow } from './db';
import { getSettings, saveSettings } from './repos';

export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: 'french-daily';
  kind: 'progress-backup';
  backupVersion: number;
  exportedAt: string;
  settings: AppSettings;
  reviews: ReviewState[];
  attempts: AttemptRecord[];
  sessions: SessionCompletionRecord[];
  milestones: MilestoneRecord[];
  challenges: ChallengeRow[];
}

export async function exportProgress(): Promise<BackupFile> {
  const settings = await getSettings();
  await saveSettings({ lastExportAt: Date.now() });
  return {
    app: 'french-daily',
    kind: 'progress-backup',
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    reviews: await db.reviews.toArray(),
    attempts: await db.attempts.toArray(),
    sessions: await db.sessions.toArray(),
    milestones: await db.milestones.toArray(),
    challenges: await db.challenges.toArray(),
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  restored?: {
    reviews: number;
    attempts: number;
    sessions: number;
    milestones: number;
    challenges: number;
  };
}

/** Validate + restore a backup. Returns a clear error instead of partial writes. */
export async function importProgress(json: string, opts: { keepTheme?: boolean } = {}): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  const b = parsed as Partial<BackupFile>;
  if (!b || b.app !== 'french-daily' || b.kind !== 'progress-backup') {
    return { ok: false, error: 'This is not a French Daily progress backup.' };
  }
  if (typeof b.backupVersion !== 'number' || b.backupVersion > BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version (${String(b.backupVersion)}). This app supports up to ${BACKUP_VERSION}.` };
  }
  if (!Array.isArray(b.reviews) || !Array.isArray(b.attempts)) {
    return { ok: false, error: 'The backup is missing review or attempt data.' };
  }

  await db.transaction('rw', [db.reviews, db.attempts, db.sessions, db.milestones, db.challenges, db.settings], async () => {
    await db.reviews.clear();
    await db.attempts.clear();
    await db.sessions.clear();
    await db.milestones.clear();
    await db.challenges.clear();
    await db.reviews.bulkPut(b.reviews as ReviewState[]);
    await db.attempts.bulkAdd(b.attempts as AttemptRecord[]);
    await db.sessions.bulkAdd((b.sessions ?? []) as SessionCompletionRecord[]);
    await db.milestones.bulkAdd((b.milestones ?? []) as MilestoneRecord[]);
    await db.challenges.bulkPut((b.challenges ?? []) as ChallengeRow[]);
  });

  if (b.settings && !opts.keepTheme) {
    await saveSettings(b.settings as AppSettings);
  }

  return {
    ok: true,
    restored: {
      reviews: b.reviews.length,
      attempts: b.attempts.length,
      sessions: (b.sessions ?? []).length,
      milestones: (b.milestones ?? []).length,
      challenges: (b.challenges ?? []).length,
    },
  };
}

/**
 * Reset learning progress. Settings (theme, goals, toggles) are kept unless
 * `includeSettings` is true. The action is destructive and must be confirmed
 * in the UI before calling.
 */
export async function resetProgress(includeSettings = false): Promise<void> {
  await db.transaction('rw', [db.reviews, db.attempts, db.sessions, db.milestones, db.challenges, db.settings], async () => {
    await db.reviews.clear();
    await db.attempts.clear();
    await db.sessions.clear();
    await db.milestones.clear();
    await db.challenges.clear();
    if (includeSettings) {
      await db.settings.clear();
    } else {
      await saveSettings({ streak: 0, longestStreak: 0, lastCompletionDate: null });
    }
  });
}

/** Trigger a browser download of the backup. */
export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `french-daily-backup-${todayLocal()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
