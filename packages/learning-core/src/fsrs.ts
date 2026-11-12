/**
 * FSRS — Free Spaced Repetition Scheduler (deterministic TypeScript port of the
 * published FSRS-4.5 core algorithm, the scheduler used by modern Anki).
 *
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki
 * Formulas (FSRS-4.5, day granularity):
 *
 *   Retrievability:  R(t, S) = (1 + FACTOR · t / S)^(1/DECAY),  FACTOR = 19/81, DECAY = -0.5
 *                    (by construction R = 0.9 when t = S)
 *
 *   First review:    S₀(G) = w[G-1]
 *                    D₀(G) = clamp(w₄ - (G-3)·w₅, 1, 10)
 *
 *   Recall (G ≥ 2):  S′ = S · (1 + e^w₈ · (11 - D) · S^(-w₉) · (e^(w₁₀·(1-R)) - 1)
 *                          · hardPenalty · easyBonus)
 *                    hardPenalty = w₁₅ if G = Hard, else 1
 *                    easyBonus   = w₁₆ if G = Easy, else 1
 *
 *   Forget (G = 1):  S′ = max(0.01, w₁₁ · D^(-w₁₂) · ((S+1)^w₁₃ - 1) · e^(w₁₄·(1-R)))
 *
 *   Difficulty:      D′ = clamp(w₇ · D₀(3) + (1-w₇) · (D - w₆·(G-3)), 1, 10)
 *
 *   Interval:        I(R) = clamp(round(S / FACTOR · (R^(1/DECAY) - 1)), 1, MAX_INTERVAL)
 *
 * Everything is pure and deterministic; dates are local "YYYY-MM-DD" strings so
 * scheduling never shifts across timezones. Simplifications vs Anki (documented
 * in docs/learning-engine.md): day granularity (no minute-level learning steps),
 * no same-day short-term stability updates, no parameter optimization.
 */

export type FsrsRating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

export const RATING = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
} as const;

export const RATING_LABELS: Record<FsrsRating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

/** Default FSRS-4.5 weights (w₀…w₁₆). */
export const DEFAULT_WEIGHTS: readonly number[] = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072,
  0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

export const FACTOR = 19 / 81;
export const DECAY = -0.5;
export const MAX_INTERVAL = 36500;
export const DEFAULT_DESIRED_RETENTION = 0.9;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface FsrsState {
  /** Memory stability in days (S). */
  stability: number;
  /** Item difficulty 1..10 (D). */
  difficulty: number;
  /** Days elapsed since the last review (t) at the time of scheduling. */
  lastInterval: number;
  /** Number of successful reviews in a row. */
  reps: number;
  /** Number of lapses (rating = Again). */
  lapses: number;
}

export interface FsrsResult {
  state: FsrsState;
  /** Interval in days until the next review at the desired retention. */
  interval: number;
  /** Expected retrievability at the moment just before the next review. */
  retrievability: number;
}

/** Initial memory state for a rating on the first review of an item. */
export function fsrsInitState(rating: FsrsRating, weights: readonly number[] = DEFAULT_WEIGHTS): FsrsState {
  const stability = clamp(weights[rating - 1], 0.1, MAX_INTERVAL);
  const difficulty = clamp(weights[4] - (rating - 3) * weights[5], 1, 10);
  return {
    stability,
    difficulty,
    lastInterval: 0,
    reps: 1,
    lapses: rating === 1 ? 1 : 0,
  };
}

/** Retrievability R after `elapsed` days given stability S. */
export function retrievability(elapsed: number, stability: number): number {
  const s = Math.max(0.01, stability);
  return Math.pow(1 + (FACTOR * Math.max(0, elapsed)) / s, DECAY);
}

/** Interval (days) that yields `desiredRetention` for a given stability. */
export function fsrsInterval(
  stability: number,
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
): number {
  const r = clamp(desiredRetention, 0.7, 0.99);
  const raw = (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL);
}

/**
 * Compute the next state + interval after reviewing with `rating`.
 * `elapsed` is the number of days since the previous review (0 for first review).
 */
export function fsrsReview(
  state: FsrsState | null,
  rating: FsrsRating,
  elapsed: number,
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
  weights: readonly number[] = DEFAULT_WEIGHTS,
): FsrsResult {
  if (!state) {
    const init = fsrsInitState(rating, weights);
    return { state: init, interval: fsrsInterval(init.stability, desiredRetention), retrievability: 1 };
  }

  const w = weights;
  const t = Math.max(0, elapsed);
  const r = retrievability(t, state.stability);
  const d = state.difficulty;

  let stability: number;
  if (rating === 1) {
    // Forgetting: new, much smaller stability.
    stability = Math.max(
      0.01,
      w[11] * Math.pow(d, -w[12]) * (Math.pow(state.stability + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)),
    );
  } else {
    const hardPenalty = rating === 2 ? w[15] : 1;
    const easyBonus = rating === 4 ? w[16] : 1;
    stability =
      state.stability *
      (1 +
        Math.exp(w[8]) *
          (11 - d) *
          Math.pow(state.stability, -w[9]) *
          (Math.exp(w[10] * (1 - r)) - 1) *
          hardPenalty *
          easyBonus);
  }
  stability = clamp(stability, 0.1, MAX_INTERVAL);

  // Difficulty update with mean reversion toward D₀(Good).
  const d0Good = clamp(w[4], 1, 10);
  const dPrime = clamp(w[7] * d0Good + (1 - w[7]) * (d - w[6] * (rating - 3)), 1, 10);

  const next: FsrsState = {
    stability,
    difficulty: dPrime,
    // Lapses are relearned the next day at day granularity (documented simplification).
    lastInterval: rating === 1 ? 1 : fsrsInterval(stability, desiredRetention),
    reps: rating === 1 ? 0 : state.reps + 1,
    lapses: state.lapses + (rating === 1 ? 1 : 0),
  };

  return {
    state: next,
    interval: next.lastInterval,
    retrievability: r,
  };
}
