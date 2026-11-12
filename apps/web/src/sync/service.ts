import { db, DEFAULT_SETTINGS, normalizeHistory } from '../storage/db';
import { refreshTodaysChallenges } from '../storage/repos';
import { brokerRequest } from './auth';
import { mergeProgress, validateSync, type SyncDocument } from './merge';

const tables = [db.attempts, db.reviews, db.sessions, db.settings, db.milestones, db.challenges, db.tombstones];
export async function readLocalProgress(): Promise<SyncDocument> {
  const [attempts, reviews, sessions, settings, milestones, challenges, deleted] = await Promise.all([
    db.attempts.toArray(), db.reviews.toArray(), db.sessions.toArray(), db.settings.get('settings'), db.milestones.toArray(), db.challenges.toArray(), db.tombstones.toArray(),
  ]);
  return { app: 'french-daily', kind: 'progress-backup', backupVersion: 2, syncVersion: 1,
    exportedAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS, ...settings }, attempts, reviews, sessions, milestones, challenges, deletedEvents: deleted.map(t => t.id) };
}

export type SyncTransport = (path: string, init?: RequestInit) => Promise<Response>;
let active: Promise<void> | null = null;
let requestedAgain = false;
/** Serialize requests in this tab. Cross-device races use GitHub's SHA lease. */
export function syncProgress(transport: SyncTransport = brokerRequest): Promise<void> {
  if (active) { requestedAgain = true; return active; }
  active = (async () => {
    do {
      requestedAgain = false;
      let uploaded = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const get = await transport('/progress');
        if (!get.ok) throw new Error(`Could not read GitHub progress (${get.status}). Your local progress is safe.`);
        const remote = await get.json() as { sha: string | null; data: unknown };
        if (remote.data !== null) validateSync(remote.data);
        const local = await db.transaction('r', tables, readLocalProgress);
        const merged = mergeProgress(local, remote.data as SyncDocument | null);
        const put = await transport('/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha: remote.sha, data: merged }) });
        if (put.status === 409) continue;
        if (!put.ok) throw new Error(`Could not save GitHub progress (${put.status}). Your local progress is safe.`);
        await db.transaction('rw', tables, async () => {
          // A card may have been answered while the network request was running.
          const current = await readLocalProgress();
          const final = mergeProgress(current, merged);
          if (final.attempts.length !== merged.attempts.length || final.deletedEvents.length !== merged.deletedEvents.length || final.sessions.length !== merged.sessions.length || (final.settings.updatedAt ?? 0) > (merged.settings.updatedAt ?? 0)) requestedAgain = true;
          const normalized = normalizeHistory(final.reviews, final.attempts);
          await db.attempts.clear(); await db.attempts.bulkAdd(normalized.attempts);
          await db.reviews.clear(); await db.reviews.bulkPut(normalized.reviews);
          await db.sessions.clear(); await db.sessions.bulkAdd(final.sessions);
          await db.settings.put(final.settings);
          await db.milestones.clear(); await db.milestones.bulkAdd(final.milestones);
          await db.challenges.clear(); await db.challenges.bulkPut(final.challenges);
          await db.tombstones.bulkPut(final.deletedEvents.map(id => ({ id })));
        });
        await refreshTodaysChallenges().catch(() => undefined);
        uploaded = true; break;
      }
      if (!uploaded) throw new Error('Another device kept updating GitHub. Please press Sync again. Your local progress is safe.');
    } while (requestedAgain);
  })().finally(() => { active = null; });
  return active;
}
