/**
 * Daily challenges — rotating, but always derived from real learning needs.
 *
 * Challenge generation rules (documented in docs/learning-engine.md):
 *   - "Finish all due reviews" appears only when reviews are actually due.
 *   - "Fix previously missed answers" appears only when the learner has items
 *     whose most recent attempt failed.
 *   - "Irregular conjugations" appears only when irregular verbs are in play.
 *   - Noun recall / sentence building appear in rotation.
 *
 * Progress is computed from recorded attempts (learning data) — never from
 * swipe counts or XP. Challenges are deterministic per local date.
 */
import { type IsoDate } from './dates';
import { createRng, type Rng } from './random';
import type { AttemptRecord, ChallengeDef, ChallengeProgress, ReviewState } from './types';

export interface ChallengeContext {
  today: IsoDate;
  /** All review states, keyed by item id. */
  reviews: Map<string, ReviewState>;
  /** Attempts recorded today (progress source). */
  attemptsToday: AttemptRecord[];
  /** All attempts (need analysis). */
  attemptsAll: AttemptRecord[];
  /** Item ids of irregular verbs. */
  irregularVerbIds: Set<string>;
  /** Number of content items available per category. */
  counts: { vocab: number; verbs: number; sentences: number };
}

/** Item ids whose most recent attempt in the last `windowDays` days failed. */
export function recentlyMissedItems(attempts: AttemptRecord[], today: IsoDate, windowDays = 7): Set<string> {
  const latest = new Map<string, AttemptRecord>();
  for (const a of attempts) {
    const prev = latest.get(a.itemId);
    if (!prev || a.timestamp > prev.timestamp) latest.set(a.itemId, a);
  }
  const out = new Set<string>();
  for (const [id, a] of latest) {
    if (!a.correct && daysBetween(a.date, today) <= windowDays) out.add(id);
  }
  return out;
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1, 12).getTime();
  const t2 = new Date(y2, m2 - 1, d2, 12).getTime();
  return Math.round((t2 - t1) / 86_400_000);
}

/** How many reviews are due today (including overdue). */
export function dueCount(ctx: ChallengeContext): number {
  let n = 0;
  for (const r of ctx.reviews.values()) if (r.nextDue <= ctx.today) n += 1;
  return n;
}

const RECALL_NOUNS: ChallengeDef = {
  id: 'recall-nouns',
  kind: 'recall-nouns',
  title: 'Recall 10 nouns',
  description: 'Answer 10 noun exercises correctly today.',
  target: 10,
  derivedFrom: 'noun attempts recorded today',
};

const IRREGULAR_CONJUGATIONS: ChallengeDef = {
  id: 'irregular-conjugations',
  kind: 'irregular-conjugations',
  title: '5 irregular conjugations',
  description: 'Answer 5 exercises on irregular verbs correctly.',
  target: 5,
  derivedFrom: 'irregular-verb attempts recorded today',
};

const FIX_MISSED: ChallengeDef = {
  id: 'fix-missed',
  kind: 'fix-missed',
  title: 'Fix 5 missed answers',
  description: 'Get 5 previously missed items right.',
  target: 5,
  derivedFrom: 'items whose last attempt failed',
};

const BUILD_SENTENCES: ChallengeDef = {
  id: 'build-sentences',
  kind: 'build-sentences',
  title: 'Build 3 sentences',
  description: 'Complete 3 sentence exercises today.',
  target: 3,
  derivedFrom: 'sentence attempts recorded today',
};

const FINISH_REVIEWS: ChallengeDef = {
  id: 'finish-reviews',
  kind: 'finish-reviews',
  title: 'Finish all due reviews',
  description: 'Clear every review scheduled for today.',
  target: 5,
  derivedFrom: 'FSRS review queue',
};

const ACCURACY_RUN: ChallengeDef = {
  id: 'accuracy-run',
  kind: 'accuracy-run',
  title: '8 correct in a row',
  description: 'Answer 8 exercises correctly in a row today.',
  target: 8,
  derivedFrom: 'consecutive correct attempts today',
};

/**
 * Pick up to 3 challenges for the day from the eligible pool, deterministically
 * per date (rotation feels fresh without being random or manipulative).
 */
export function generateChallenges(ctx: ChallengeContext, rng: Rng = createRng(hashDate(ctx.today))): ChallengeProgress[] {
  const eligible: ChallengeDef[] = [];

  const due = dueCount(ctx);
  if (due > 0) {
    eligible.push({ ...FINISH_REVIEWS, target: Math.min(due, 30), description: `Clear the ${Math.min(due, 30)} review${due === 1 ? '' : 's'} scheduled for today.` });
  }

  const missed = recentlyMissedItems(ctx.attemptsAll, ctx.today);
  if (missed.size > 0) {
    const target = Math.min(5, missed.size);
    eligible.push({ ...FIX_MISSED, target, description: `Get ${target} previously missed item${target === 1 ? '' : 's'} right.` });
  }

  const hasIrregular = [...ctx.irregularVerbIds].some((id) => (ctx.reviews.get(id)?.nextDue ?? '0') <= ctx.today || !ctx.reviews.has(id));
  if (ctx.counts.verbs > 0 && (hasIrregular || ctx.irregularVerbIds.size > 0)) {
    eligible.push(IRREGULAR_CONJUGATIONS);
  }

  if (ctx.counts.vocab >= 10) eligible.push(RECALL_NOUNS);
  if (ctx.counts.sentences >= 3) eligible.push(BUILD_SENTENCES);
  eligible.push(ACCURACY_RUN);

  // Urgent, need-driven challenges come first (they are never rotated out);
  // the rest rotate deterministically by date so days feel fresh.
  const priority: ChallengeDef[] = [];
  const rest: ChallengeDef[] = [];
  for (const def of eligible) {
    if (def.id === 'finish-reviews' || def.id === 'fix-missed') priority.push(def);
    else rest.push(def);
  }
  const picked = [...priority, ...shuffleWith(rng, rest)].slice(0, 3);
  return picked.map((def) => ({
    id: def.id,
    date: ctx.today,
    def,
    progress: challengeProgress(def, ctx),
    completed: challengeProgress(def, ctx) >= def.target,
  }));
}

/** Current progress for a challenge, computed from today's attempts. */
export function challengeProgress(def: ChallengeDef, ctx: ChallengeContext): number {
  const today = ctx.attemptsToday;
  switch (def.kind) {
    case 'recall-nouns':
      return today.filter((a) => a.kind === 'vocab' && a.correct).length;
    case 'irregular-conjugations':
      return today.filter((a) => a.kind === 'verb' && a.correct && ctx.irregularVerbIds.has(a.itemId)).length;
    case 'fix-missed': {
      const missed = recentlyMissedItems(ctx.attemptsAll, ctx.today);
      return today.filter((a) => a.correct && missed.has(a.itemId)).length;
    }
    case 'build-sentences':
      return today.filter((a) => a.kind === 'sentence' && a.correct).length;
    case 'finish-reviews': {
      // Reviews cleared today: due items (as of start of day) now scheduled ahead.
      let cleared = 0;
      for (const r of ctx.reviews.values()) {
        if (r.lastReviewed === ctx.today && r.nextDue > ctx.today) cleared += 1;
      }
      return cleared;
    }
    case 'accuracy-run': {
      let run = 0;
      let best = 0;
      for (const a of [...today].sort((x, y) => x.timestamp - y.timestamp)) {
        run = a.correct ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    }
  }
}

/** Recompute progress for a set of challenge records (after new attempts). */
export function refreshChallenges(challenges: ChallengeProgress[], ctx: ChallengeContext): ChallengeProgress[] {
  return challenges.map((c) => {
    const progress = challengeProgress(c.def, ctx);
    return { ...c, progress, completed: progress >= c.def.target };
  });
}

function hashDate(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleWith<T>(rng: Rng, items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
