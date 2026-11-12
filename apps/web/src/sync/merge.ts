import { applyReview, computeStreak, initialReviewState, todayLocal, type ReviewState } from '@french-daily/learning-core';
import { validateBackup, type BackupFile } from '../storage/backup';

export interface SyncDocument extends BackupFile {
  syncVersion: 1;
  deletedEvents: string[];
}

import { eventId } from './identity';
const withoutLocalId = <T extends { id?: number }>(row: T): T => {
  const { id: _id, ...rest } = row;
  return rest as T;
};

export function validateSync(value: unknown): asserts value is SyncDocument {
  if (!value || typeof value !== 'object') throw new Error('GitHub does not contain a valid progress file.');
  const doc = value as SyncDocument;
  if (doc.app !== 'french-daily' || doc.kind !== 'progress-backup' || doc.syncVersion !== 1 || doc.backupVersion !== 2 || !Array.isArray(doc.attempts) || !Array.isArray(doc.reviews) || !Array.isArray(doc.sessions) || !Array.isArray(doc.milestones) || !Array.isArray(doc.challenges) || !Array.isArray(doc.deletedEvents) || doc.deletedEvents.some(id => typeof id !== 'string') || !doc.settings || !Number.isFinite(Date.parse(doc.exportedAt))) throw new Error('Unsupported or malformed GitHub progress file.');
  const error = validateBackup(doc);
  if (error) throw new Error(error);
  if (doc.attempts.some(a => a.eventId !== undefined && typeof a.eventId !== 'string')) throw new Error('Invalid review event ID.');
}

/** Union event logs, remove tombstones, then replay FSRS in one stable order. */
export function mergeProgress(local: SyncDocument, remote: SyncDocument | null, today = todayLocal()): SyncDocument {
  validateSync(local);
  if (remote) validateSync(remote);
  if (!remote) remote = { ...local, reviews: [], attempts: [], sessions: [], milestones: [], challenges: [], deletedEvents: [] };
  const deleted = new Set([...local.deletedEvents, ...remote.deletedEvents]);
  const attempts = [...new Map([...remote.attempts, ...local.attempts].map(a => [eventId(a), { ...withoutLocalId(a), eventId: eventId(a) }])).values()]
    .filter(a => !deleted.has(a.eventId))
    .sort((a, b) => a.timestamp - b.timestamp || a.eventId.localeCompare(b.eventId));
  const settingsKey = (s: typeof local.settings) => JSON.stringify(Object.keys(s).sort().map(k => [k, s[k as keyof typeof s]]));
  const difference = (local.settings.updatedAt ?? 0) - (remote.settings.updatedAt ?? 0);
  const preferred = difference > 0 || (difference === 0 && settingsKey(local.settings) >= settingsKey(remote.settings)) ? local.settings : remote.settings;
  const reviews = new Map<string, ReviewState>();
  // Preserve imported schedules that have no event log; do not invent reviews.
  const logged = new Set([...local.attempts, ...remote.attempts].map(a => a.itemId));
  for (const r of [...remote.reviews, ...local.reviews]) {
    if (!logged.has(r.itemId) && !deleted.has(`review:${r.itemId}`)) {
      const previous = reviews.get(r.itemId);
      if (!previous || r.lastReviewed > previous.lastReviewed || r.reviewCount > previous.reviewCount) reviews.set(r.itemId, r);
    }
  }
  const metadata = new Map([...remote.reviews, ...local.reviews].map(r => [r.itemId, r]));
  for (const a of attempts) {
    const previous = reviews.get(a.itemId) ?? initialReviewState(a.itemId, a.kind, a.date);
    const state = applyReview(previous, { outcome: a.outcome, given: a.response, expected: '', isCorrect: a.correct, isTypo: a.outcome === 'typo' || a.outcome === 'accent', feedback: '', explanation: '' }, a.date, preferred.desiredRetention, a.rating);
    reviews.set(a.itemId, { ...state, contentId: a.contentId, exercise: metadata.get(a.itemId)?.exercise });
  }
  const sessions = [...new Map([...remote.sessions, ...local.sessions].map(s => [s.syncId ?? s.sessionId, withoutLocalId(s)])).values()]
    .filter(s => !deleted.has(`session:${s.syncId ?? s.sessionId}`)).sort((a, b) => a.timestamp - b.timestamp || a.sessionId.localeCompare(b.sessionId));
  const milestones = [...new Map([...remote.milestones, ...local.milestones].filter(m => !deleted.has(`milestone:${m.kind}:${m.value}:${m.achievedAt}`)).map(m => [`${m.kind}:${m.value}`, withoutLocalId(m)])).values()];
  const challenges = [...new Map([...remote.challenges, ...local.challenges].map(c => [c.id, c])).values()];
  const streak = preferred.streaksEnabled ? computeStreak(sessions.map(s => s.date), today) : 0;
  return { ...local, settings: { ...preferred, streak, longestStreak: Math.max(preferred.longestStreak, streak), lastCompletionDate: sessions.at(-1)?.date ?? null },
    reviews: [...reviews.values()], attempts, sessions, milestones, challenges, deletedEvents: [...deleted].sort(), exportedAt: new Date().toISOString() };
}
