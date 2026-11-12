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
import { db, DEFAULT_SETTINGS, normalizeHistory, type ChallengeRow } from './db';
import { getSettings, saveSettings } from './repos';

export const BACKUP_VERSION = 2;

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
  if (!Number.isInteger(b.backupVersion) || b.backupVersion! < 1 || b.backupVersion! > BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version (${String(b.backupVersion)}). This app supports up to ${BACKUP_VERSION}.` };
  }
  if (!Array.isArray(b.reviews) || !Array.isArray(b.attempts)) {
    return { ok: false, error: 'The backup is missing review or attempt data.' };
  }

  const error = validateBackup(b);
  if (error) return { ok: false, error };
  try {
    const normalized = normalizeHistory(b.reviews!, b.attempts!);
    const current = await getSettings();
    const restoredSettings = { ...DEFAULT_SETTINGS, ...b.settings, ...(opts.keepTheme ? { theme: current.theme } : {}), id: 'settings' as const };
    await db.transaction('rw', [db.reviews, db.attempts, db.sessions, db.milestones, db.challenges, db.settings, db.snapshots], async () => {
      await db.snapshots.add({ createdAt: Date.now(), data: {
        reviews: await db.reviews.toArray(), attempts: await db.attempts.toArray(),
        sessions: await db.sessions.toArray(), milestones: await db.milestones.toArray(),
        challenges: await db.challenges.toArray(), settings: await db.settings.toArray(),
      } });
      await db.reviews.clear(); await db.attempts.clear(); await db.sessions.clear();
      await db.milestones.clear(); await db.challenges.clear();
      await db.reviews.bulkPut(normalized.reviews);
      await db.attempts.bulkAdd(normalized.attempts);
      await db.sessions.bulkAdd((b.sessions ?? []) as SessionCompletionRecord[]);
      await db.milestones.bulkAdd((b.milestones ?? []) as MilestoneRecord[]);
      await db.challenges.bulkPut((b.challenges ?? []).map(c => ({ ...c, id: `${c.date}::${c.def.id}` })) as ChallengeRow[]);
      await db.settings.put(restoredSettings);
    });
  } catch { return { ok: false, error: 'Restore failed. Your previous progress was kept. Check available storage and try again.' }; }

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

type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const date = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0,10) === v;
const oneOf = (v: unknown, choices: unknown[]) => choices.includes(v);
function validateBackup(b: Partial<BackupFile>): string | null {
  try {
    if (!b.reviews!.every(v => row(v) && text(v.itemId) && oneOf(v.kind, ['vocab','verb','sentence']) && oneOf(v.status, ['new','learning','review']) && date(v.lastReviewed) && date(v.nextDue) && ['reviewCount','correctCount','incorrectCount','lapseCount','reps','interval','stability','difficulty'].every(k => number((v as unknown as Row)[k])) && v.difficulty >= 1 && v.difficulty <= 10 && oneOf(v.lastRating, [null,1,2,3,4]))) return 'Invalid review record in backup.';
    if (new Set(b.reviews!.map(r => r.itemId)).size !== b.reviews!.length) return 'Duplicate review IDs in backup.';
    if (!b.attempts!.every(v => row(v) && text(v.itemId) && oneOf(v.kind,['vocab','verb','sentence']) && oneOf(v.exerciseKind,['translation-typed','conjugation-fill','conjugation-direct','sentence-construction','multiple-choice','word-order','gender-select']) && date(v.date) && number(v.timestamp) && typeof v.response === 'string' && oneOf(v.outcome,['correct','accent','typo','article','wrong']) && typeof v.correct === 'boolean' && text(v.sessionId) && (v.durationMs === null || number(v.durationMs)) && oneOf(v.rating,[1,2,3,4]))) return 'Invalid attempt record in backup.';
    if (b.sessions !== undefined && (!Array.isArray(b.sessions) || !b.sessions.every(v => row(v) && text(v.sessionId) && oneOf(v.mode,['daily','custom','review']) && date(v.date) && ['timestamp','total','correct','incorrect','accuracy'].every(k => number((v as unknown as Row)[k])) && v.accuracy <= 100 && v.total === v.correct + v.incorrect && (v.durationMs === null || number(v.durationMs))))) return 'Invalid session record in backup.';
    if (b.milestones !== undefined && (!Array.isArray(b.milestones) || !b.milestones.every(v => row(v) && oneOf(v.kind,['vocab-mastered','verbs-mastered','accuracy-record','weekly-consistency','recovery','reviews-total']) && text(v.label) && date(v.date) && number(v.value) && number(v.achievedAt)))) return 'Invalid milestone record in backup.';
    if (b.challenges !== undefined && (!Array.isArray(b.challenges) || !b.challenges.every(v => row(v) && text(v.id) && date(v.date) && number(v.progress) && typeof v.completed === 'boolean' && row(v.def) && text(v.def.id) && text(v.def.title) && text(v.def.description) && text(v.def.derivedFrom) && number(v.def.target) && oneOf(v.def.kind,['recall-nouns','irregular-conjugations','fix-missed','build-sentences','finish-reviews','accuracy-run']) && (v.def.itemIds === undefined || (Array.isArray(v.def.itemIds) && v.def.itemIds.every(text)))))) return 'Invalid challenge record in backup.';
    if (b.settings !== undefined) {
      if (!row(b.settings)) return 'Invalid settings in backup.';
      const settings = { ...DEFAULT_SETTINGS, ...b.settings };
      if (settings.id !== 'settings' || !oneOf(settings.theme,['light','dark','system']) || !oneOf(settings.sessionSize,['short','standard','long']) || !number(settings.desiredRetention) || settings.desiredRetention < 0.7 || settings.desiredRetention > 0.99 || !number(settings.dailyGoalMinutes) || settings.dailyGoalMinutes < 1 || settings.dailyGoalMinutes > 120 || !number(settings.streak) || !number(settings.longestStreak) || (settings.lastCompletionDate !== null && !date(settings.lastCompletionDate)) || (settings.lastExportAt !== null && !number(settings.lastExportAt)) || ['soundEnabled','hapticsEnabled','celebrationsEnabled','streaksEnabled','pronunciationEnabled','notificationsEnabled'].some(k => typeof (settings as unknown as Row)[k] !== 'boolean')) return 'Invalid settings in backup.';
    }
    return null;
  } catch { return 'Malformed backup data.'; }
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

/** Downloadable recovery point created before migration or restore. */
export async function exportRecoverySnapshot(): Promise<BackupFile | null> {
  const latest = await db.snapshots.orderBy('createdAt').last();
  if (!latest || !row(latest.data)) return null;
  const data = latest.data;
  const settings = Array.isArray(data.settings) ? data.settings[0] : data.settings;
  return { app: 'french-daily', kind: 'progress-backup', backupVersion: 1,
    exportedAt: new Date(latest.createdAt).toISOString(), settings: { ...DEFAULT_SETTINGS, ...(row(settings) ? settings : {}) },
    reviews: data.reviews as ReviewState[], attempts: data.attempts as AttemptRecord[],
    sessions: data.sessions as SessionCompletionRecord[], milestones: data.milestones as MilestoneRecord[], challenges: data.challenges as ChallengeRow[] };
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
