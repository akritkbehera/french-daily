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
  }
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
