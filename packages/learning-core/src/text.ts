/**
 * Deterministic text normalization and comparison for answer grading.
 */

/** Normalize typography: apostrophes → ', collapse whitespace, trim. */
export function normalizeTypography(input: string): string {
  return input
    .replace(/[\u2018\u2019\u02BC\u0060]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fold accents/diacritics: é → e, è → e, ç → c, œ → oe…
 * Used to distinguish "accent typo" from a genuinely wrong answer.
 */
export function foldAccents(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE');
}

/** Normalize an answer for comparison: typography, case, trailing punctuation. */
export function normalizeAnswer(input: string): string {
  return normalizeTypography(input)
    .toLowerCase()
    .replace(/[.!?…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized + accent-folded form used to detect accent-only mistakes. */
export function normalizeLoose(input: string): string {
  return foldAccents(normalizeAnswer(input));
}

/** Classic Levenshtein distance, used for typo detection. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Maximum edit distance tolerated as a "typo" for a given answer length. */
export function typoThreshold(answer: string): number {
  const n = answer.replace(/\s/g, '').length;
  if (n <= 3) return 0;
  if (n <= 7) return 1;
  return 2;
}

/** True when the two strings differ only by accents/diacritics (and case). */
export function differsOnlyByAccents(a: string, b: string): boolean {
  const na = normalizeAnswer(a);
  const nb = normalizeAnswer(b);
  return na !== nb && foldAccents(na) === foldAccents(nb);
}

/**
 * Tokenize a sentence into word-order tiles: keeps apostrophe groups together
 * ("l'école" is one token) and strips surrounding punctuation.
 */
export function tokenizeSentence(sentence: string): string[] {
  return normalizeTypography(sentence)
    .split(' ')
    .map((t) => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ''))
    .filter((t) => t.length > 0);
}
