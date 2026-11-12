/**
 * Shared domain types for French Daily.
 *
 * Learning *content* (vocabulary items, verbs, sentences) is static and versioned
 * with the app. User *progress* (attempts, review state, settings) lives in IndexedDB
 * and is keyed by content IDs. The two are intentionally kept separate so content
 * upgrades never touch learning history.
 */

export type Gender = 'm' | 'f';

export type Level = 'A1' | 'A2' | 'B1';

export type Topic =
  | 'home'
  | 'food'
  | 'travel'
  | 'city'
  | 'family'
  | 'work'
  | 'school'
  | 'nature'
  | 'body'
  | 'clothing'
  | 'time'
  | 'shopping'
  | 'leisure'
  | 'health'
  | 'technology';

/** Article surface forms. These are derived from gender + initial sound (elision). */
export interface ArticleForms {
  /** le | la | l' */
  definiteSingular: string;
  /** le | la | l' — same surface form, kept for clarity in exercises. */
  definiteSingularWithSpace: string;
  /** un | une */
  indefiniteSingular: string;
  /** les */
  definitePlural: string;
  /** des */
  indefinitePlural: string;
}

/** A curated vocabulary entry (nouns, and a few fixed phrases used as nouns). */
export interface VocabItem {
  number?: 'singular' | 'plural';
  countable?: boolean;
  id: string;
  /** French lemma, e.g. "maison". */
  french: string;
  /** One or more English translations, e.g. ["house"]. */
  english: string[];
  /** Grammatical gender — independent of surface article form ("l'école" is feminine). */
  gender: Gender;
  /** Surface elision: the article contracts to l' before vowel/mute-h. */
  elision: boolean;
  /** Singular form (equals `french` unless irregular). */
  singular: string;
  /** Plural form (regular rules or explicit override). */
  plural: string;
  articles: ArticleForms;
  exampleFr: string;
  exampleEn: string;
  level: Level;
  topic: Topic;
}

/** Compact authoring shape for vocabulary entries (expanded by `buildVocabulary`). */
export interface RawVocabEntry {
  number?: 'singular' | 'plural';
  countable?: boolean;
  french: string;
  english: string[];
  gender: Gender;
  topic: Topic;
  level: Level;
  exampleFr: string;
  exampleEn: string;
  /** Explicit plural override (default: regular French rules). */
  plural?: string;
  /** Explicit elision override; required for words starting with "h". */
  elision?: boolean;
  /** Stable id override (default: `noun:<french>`). */
  id?: string;
}

export type PronounKey = 'je' | 'tu' | 'il' | 'nous' | 'vous' | 'ils';

export const PRONOUNS: PronounKey[] = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];

/** Pronoun display labels (il/elle and ils/elles collapsed into one key). */
export const PRONOUN_LABELS: Record<PronounKey, string> = {
  je: 'je',
  tu: 'tu',
  il: 'il/elle',
  nous: 'nous',
  vous: 'vous',
  ils: 'ils/elles',
};

export type VerbGroup = 'er' | 'ir' | 're' | 'irregular';

export interface Verb {
  id: string;
  /** Infinitive, e.g. "prendre" or "se lever". */
  infinitive: string;
  /** Infinitive without the reflexive pronoun, e.g. "lever". */
  stem: string;
  reflexive: boolean;
  group: VerbGroup;
  english: string;
  /** Present indicative forms keyed by pronoun. */
  forms: Record<PronounKey, string>;
  level: Level;
  exampleFr: string;
  exampleEn: string;
  /**
   * Pronoun-independent complement used for fill-in-the-blank exercises,
   * e.g. "au cinéma" → "Nous ___ (aller) au cinéma."
   */
  fillComplement: string;
}

export interface RawVerb {
  infinitive: string;
  english: string;
  group: VerbGroup;
  forms: Record<PronounKey, string>;
  level?: Level;
  exampleFr: string;
  exampleEn: string;
  fillComplement: string;
}

/** A curated translation pair used for sentence-construction exercises. */
export interface SentencePair {
  id: string;
  en: string;
  fr: string;
  /** Additional accepted French translations (deterministic grading, no LLM). */
  alternatives: string[];
  topic: Topic;
  level: Level;
  /** Grammar note shown as explanation. */
  note: string;
}

/* ------------------------------------------------------------------ */
/* Review / spaced repetition                                          */
/* ------------------------------------------------------------------ */

/** FSRS ratings: Again | Hard | Good | Easy (defined in ./fsrs.ts). */
export type { FsrsRating } from './fsrs';
import type { FsrsRating } from './fsrs';

/**
 * FSRS review state for one content item, persisted per user.
 *
 * FSRS replaces SM-2's "ease factor" with two explicit quantities:
 *   - stability: days until recall probability drops to 90%,
 *   - difficulty: 1 (easy) … 10 (hard).
 */
export interface ReviewState {
  contentId?: string;
  exercise?: Exercise;
  /** Content id, e.g. "noun:maison" or "verb:prendre". */
  itemId: string;
  kind: ReviewKind;
  /** new | learning (last rating Again) | review */
  status: 'new' | 'learning' | 'review';
  /** ISO local date YYYY-MM-DD of the last graded attempt. */
  lastReviewed: string;
  /** ISO local date YYYY-MM-DD when the item is next due. */
  nextDue: string;
  reviewCount: number;
  /** Total correct / incorrect graded attempts across history. */
  correctCount: number;
  incorrectCount: number;
  /** Times the item was forgotten (FSRS rating Again). */
  lapseCount: number;
  /** Consecutive successful reviews (resets on lapse). */
  reps: number;
  /** Current interval in days. */
  interval: number;
  /** FSRS memory stability in days. */
  stability: number;
  /** FSRS difficulty 1..10. */
  difficulty: number;
  lastRating: FsrsRating | null;
}

export type ReviewKind = 'vocab' | 'verb' | 'sentence';

export type ExerciseKind =
  | 'translation-typed'
  | 'conjugation-fill'
  | 'conjugation-direct'
  | 'sentence-construction'
  | 'multiple-choice'
  | 'word-order'
  | 'gender-select';

export interface ExerciseBase {
  /** Stable id of the exercise instance (deterministic per content id + kind). */
  id: string;
  kind: ExerciseKind;
  /** Content id the exercise is tracking for spaced repetition. */
  itemId: string;
  reviewKind: ReviewKind;
  topic: Topic;
  level: Level;
  prompt: string;
  /** Short instruction line, e.g. "Translate into French". */
  instruction: string;
  expected: string;
  accepted: string[];
  explanation: string;
  /** Optional hint shown on demand. */
  hint?: string;
}

export interface TypedExercise extends ExerciseBase {
  kind: 'translation-typed';
  direction: 'en-fr' | 'fr-en';
}

export interface ConjugationFillExercise extends ExerciseBase {
  kind: 'conjugation-fill';
  infinitive: string;
  pronoun: PronounKey;
}

export interface ConjugationDirectExercise extends ExerciseBase {
  kind: 'conjugation-direct';
  infinitive: string;
  pronoun: PronounKey;
}

export interface SentenceConstructionExercise extends ExerciseBase {
  kind: 'sentence-construction';
  direction: 'en-fr' | 'fr-en';
}

export interface MultipleChoiceExercise extends ExerciseBase {
  kind: 'multiple-choice';
  options: string[];
  correctIndex: number;
}

export interface WordOrderExercise extends ExerciseBase {
  kind: 'word-order';
  tokens: string[];
  correctOrder: string[];
}

export interface GenderSelectExercise extends ExerciseBase {
  kind: 'gender-select';
  /** Which article slot is being practised. */
  articleType: 'definite' | 'indefinite' | 'definite-plural' | 'indefinite-plural';
  options: string[];
}

export type Exercise =
  | TypedExercise
  | ConjugationFillExercise
  | ConjugationDirectExercise
  | SentenceConstructionExercise
  | MultipleChoiceExercise
  | WordOrderExercise
  | GenderSelectExercise;

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

export type GradeOutcome =
  | 'correct'
  /** Answer is right apart from accents/diacritics — typo, not grammar. */
  | 'accent'
  /** Right word(s) but a missing or wrong article. */
  | 'article'
  /** Very close spelling (edit distance) — typo, not grammar. */
  | 'typo'
  /** Grammatically or lexically wrong. */
  | 'wrong';

export interface GradeResult {
  outcome: GradeOutcome;
  /** Normalized learner answer that was compared. */
  given: string;
  /** The canonical expected answer. */
  expected: string;
  /** True when the answer is accepted as correct for scoring. */
  isCorrect: boolean;
  /** True when the mistake is a spelling/typo issue rather than grammar. */
  isTypo: boolean;
  /** Short, human feedback line. */
  feedback: string;
  /** Grammar/rule explanation (always provided for incorrect answers). */
  explanation: string;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export type SessionSection = 'nouns' | 'verbs' | 'sentences';

export type SessionMode = 'daily' | 'review' | 'custom';

export interface SessionConfig {
  mode: SessionMode;
  /** Exercises per section (daily mode) or total target (custom/review). */
  nouns: number;
  verbs: number;
  sentences: number;
  topics: Topic[] | 'all';
  levels: Level[] | 'all';
  /** Restrict to specific exercise kinds (custom mode). */
  kinds: ExerciseKind[] | 'all';
}

export interface SessionItem {
  exercise: Exercise;
  section: SessionSection;
  answered: boolean;
  response: string | null;
  grade: GradeResult | null;
  /** True when this instance is an in-session retry of a failed item. */
  retry: boolean;
}

export interface SessionState {
  id: string;
  config: SessionConfig;
  items: SessionItem[];
  startedAt: number;
  finishedAt: number | null;
  /** True only when every exercise has been answered (retries included). */
  complete: boolean;
}

export interface SessionSummary {
  total: number;
  correct: number;
  incorrect: number;
  typos: number;
  accuracy: number;
  bySection: Record<SessionSection, { correct: number; total: number }>;
  /** Items that answered incorrectly and are now scheduled for review. */
  scheduledForReview: string[];
  weakAreas: WeakArea[];
  streakDays: number;
  completedOn: string;
}

export interface WeakArea {
  label: string;
  detail: string;
  itemId: string | null;
  incorrect: number;
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export interface AttemptRecord {
  contentId?: string;
  id?: number;
  itemId: string;
  kind: ReviewKind;
  exerciseKind: ExerciseKind;
  /** ISO local date YYYY-MM-DD. */
  date: string;
  timestamp: number;
  response: string;
  outcome: GradeOutcome;
  correct: boolean;
  sessionId: string;
  /** Milliseconds between exercise presentation and submission (learning metric). */
  durationMs: number | null;
  /** FSRS rating implied by the outcome. */
  rating: FsrsRating;
}

export interface SessionCompletionRecord {
  id?: number;
  sessionId: string;
  mode: SessionMode;
  date: string;
  timestamp: number;
  total: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  /** Total active time in the session, excluding idle gaps. */
  durationMs: number | null;
}

/* ------------------------------------------------------------------ */
/* Daily challenges & milestones (engagement layer)                    */
/* ------------------------------------------------------------------ */

export type ChallengeKind =
  | 'recall-nouns'
  | 'irregular-conjugations'
  | 'fix-missed'
  | 'build-sentences'
  | 'finish-reviews'
  | 'accuracy-run';

export interface ChallengeDef {
  itemIds?: string[];
  id: string;
  kind: ChallengeKind;
  title: string;
  description: string;
  target: number;
  /** Learning metric this challenge is derived from (never swipe counts or XP). */
  derivedFrom: string;
}

export interface ChallengeProgress {
  id: string;
  date: string;
  def: ChallengeDef;
  progress: number;
  completed: boolean;
}

export type MilestoneKind =
  | 'vocab-mastered'
  | 'verbs-mastered'
  | 'accuracy-record'
  | 'weekly-consistency'
  | 'recovery'
  | 'reviews-total';

export interface MilestoneRecord {
  id?: number;
  kind: MilestoneKind;
  label: string;
  achievedAt: number;
  date: string;
  value: number;
}

export interface AppSettings {
  id: 'settings';
  theme: 'light' | 'dark' | 'system';
  /** Exercises per section in a daily session. */
  sessionSize: 'short' | 'standard' | 'long';
  dailyGoalMinutes: number;
  /** Last completed session date (ISO local), used for streak display. */
  lastCompletionDate: string | null;
  streak: number;
  longestStreak: number;
  /** Epoch ms of the last app-data export (informational). */
  lastExportAt: number | null;
  /** Optional gamification — every item can be disabled. */
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  celebrationsEnabled: boolean;
  streaksEnabled: boolean;
  /** Pronunciation playback via the Web Speech API (no external service). */
  pronunciationEnabled: boolean;
  /** Challenge reminder notification where the platform allows it. */
  notificationsEnabled: boolean;
  /** FSRS desired retention target (0.80 – 0.95). */
  desiredRetention: number;
}

/** Definition thresholds for the progress dashboard (documented in docs/learning-engine.md). */
export const LEARNED_MIN_DAYS = 2;
export const LEARNED_MIN_CORRECT = 2;
export const MASTERED_MIN_DAYS = 3;
export const MASTERED_MIN_CORRECT = 4;
export const MASTERED_MIN_INTERVAL = 7;
