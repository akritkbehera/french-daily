/**
 * IndexedDB persistence (Dexie).
 *
 * Schema policy (docs/data-model.md):
 *  - Learning *content* is never stored here — it ships with the app.
 *  - User *progress* (attempts, review states, sessions, milestones) lives here
 *    and is keyed by content ids, so app upgrades never touch history.
 *  - Upgrades use additive Dexie version migrations; rows are never dropped.
 */
import Dexie, { type Table } from 'dexie';
import { exerciseCatalog } from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import type {
  AppSettings,
  AttemptRecord,
  ChallengeProgress,
  MilestoneRecord,
  ReviewState,
  SessionCompletionRecord,
} from '@french-daily/learning-core';

export interface ChallengeRow extends ChallengeProgress {
  /** `${date}::${def.id}` */
  id: string;
}

export class FrenchDailyDb extends Dexie {
  attempts!: Table<AttemptRecord, number>;
  reviews!: Table<ReviewState, string>;
  sessions!: Table<SessionCompletionRecord, number>;
  milestones!: Table<MilestoneRecord, number>;
  challenges!: Table<ChallengeRow, string>;
  settings!: Table<AppSettings, string>;
  snapshots!: Table<{ id?: number; createdAt: number; data: unknown }, number>;

  constructor(name = 'french-daily') {
    super(name);
    this.version(1).stores({
      attempts: '++id, itemId, date, timestamp, sessionId, kind',
      reviews: 'itemId, nextDue, kind, status, difficulty',
      sessions: '++id, sessionId, date, timestamp, mode',
      milestones: '++id, kind, date',
      challenges: 'id, date',
      settings: 'id',
    });
    this.version(2).stores({ snapshots: '++id, createdAt' }).upgrade(async tx => {
      const reviews = await tx.table('reviews').toArray();
      const attempts = await tx.table('attempts').toArray();
      await tx.table('snapshots').add({ createdAt: Date.now(), data: {
        reviews, attempts, sessions: await tx.table('sessions').toArray(),
        settings: await tx.table('settings').toArray(), challenges: await tx.table('challenges').toArray(),
        milestones: await tx.table('milestones').toArray(),
      } });
      const normalized = normalizeHistory(reviews, attempts);
      await tx.table('reviews').clear(); await tx.table('reviews').bulkPut(normalized.reviews);
      await tx.table('attempts').clear(); await tx.table('attempts').bulkPut(normalized.attempts);
      const challenges = await tx.table('challenges').toArray();
      await tx.table('challenges').clear();
      for (const c of challenges) await tx.table('challenges').put({ ...c, id: `${c.date}::${c.def.id}` });
    });
  }
}

/** Legacy history is assigned to one task only; the raw snapshot remains recoverable. */
export function normalizeHistory(reviews: ReviewState[], attempts: AttemptRecord[]) {
  const catalog = exerciseCatalog(sources);
  const taskFor = (id: string, kind?: string) => catalog.find(e => e.itemId === id && (!kind || e.kind === kind)) ?? catalog.find(e => e.itemId === id);
  return {
    attempts: attempts.map(a => {
      const task = a.itemId.includes('::') ? undefined : taskFor(a.itemId, a.exerciseKind);
      return task ? { ...a, contentId: a.itemId, itemId: task.id } : a;
    }),
    reviews: reviews.map(r => {
      const last = attempts.filter(a => a.itemId === r.itemId).sort((a,b) => b.timestamp - a.timestamp)[0];
      const task = r.itemId.includes('::') ? catalog.find(e => e.id === r.itemId) : taskFor(r.itemId, last?.exerciseKind);
      return task ? { ...r, contentId: task.itemId, itemId: task.id, exercise: task } : { ...r, exercise: undefined };
    }),
  };
}

export const db = new FrenchDailyDb();

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  theme: 'system',
  sessionSize: 'standard',
  dailyGoalMinutes: 10,
  lastCompletionDate: null,
  streak: 0,
  longestStreak: 0,
  lastExportAt: null,
  soundEnabled: true,
  hapticsEnabled: true,
  celebrationsEnabled: true,
  streaksEnabled: true,
  pronunciationEnabled: true,
  notificationsEnabled: false,
  desiredRetention: 0.9,
};
