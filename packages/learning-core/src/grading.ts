/**
 * Deterministic answer grading.
 *
 * Design goals:
 *  - Deterministic: accepted answers and alternatives are curated data, never LLM output.
 *  - Distinguish typos (accents, small misspellings, missing article) from real
 *    grammatical errors, and always show the correct spelling.
 */
import type { Exercise, GradeOutcome, GradeResult } from './types';
import {
  differsOnlyByAccents,
  levenshtein,
  normalizeAnswer,
  normalizeLoose,
  normalizeTypography,
  typoThreshold,
} from './text';

/** All accepted answers for an exercise, normalized once. */
function acceptedForms(exercise: Exercise): string[] {
  return [exercise.expected, ...exercise.accepted].map(normalizeAnswer);
}

const FEEDBACK: Record<GradeOutcome, string> = {
  correct: 'Correct.',
  accent: 'Almost — mind the accents.',
  article: 'The word is right, but the article is missing or wrong.',
  typo: 'Almost — watch the spelling.',
  wrong: 'Not quite.',
};

export interface GradeContext {
  /** Rule/conjugation explanation shown for incorrect answers. */
  explanation: string;
}

/**
 * Grade a free-typed answer against an exercise.
 * Returns `isCorrect` only for exact accepted matches; typo outcomes are
 * reported separately so the UI can show the right kind of help.
 */
export function gradeTypedAnswer(
  exercise: Exercise,
  rawResponse: string,
  ctx?: GradeContext,
): GradeResult {
  const explanation = ctx?.explanation ?? exercise.explanation;
  const given = normalizeAnswer(rawResponse);
  const expected = normalizeAnswer(exercise.expected);
  const accepted = acceptedForms(exercise);

  if (given.length === 0) {
    return {
      outcome: 'wrong',
      given: rawResponse,
      expected: exercise.expected,
      isCorrect: false,
      isTypo: false,
      feedback: 'No answer entered.',
      explanation,
    };
  }

  if (accepted.includes(given)) {
    return {
      outcome: 'correct',
      given: rawResponse,
      expected: exercise.expected,
      isCorrect: true,
      isTypo: false,
      feedback: FEEDBACK.correct,
      explanation,
    };
  }

  // Accent-only difference: the learner knows the word, the spelling needs care.
  if (accepted.some((a) => differsOnlyByAccents(a, rawResponse))) {
    return {
      outcome: 'accent',
      given: rawResponse,
      expected: exercise.expected,
      isCorrect: false,
      isTypo: true,
      feedback: `${FEEDBACK.accent} Correct spelling: ${exercise.expected}`,
      explanation,
    };
  }

  // Missing/wrong article: "maison" instead of "la maison".
  const stripped = stripArticle(given);
  const articleMiss = accepted.find((a) => stripArticle(a) === stripped && stripped !== a);
  if (articleMiss && stripped.length > 0) {
    return {
      outcome: 'article',
      given: rawResponse,
      expected: exercise.expected,
      isCorrect: false,
      isTypo: true,
      feedback: `${FEEDBACK.article} Correct answer: ${exercise.expected}`,
      explanation,
    };
  }

  // Small spelling difference: typo, not a grammar error.
  const closest = accepted
    .map((a) => ({ a, d: levenshtein(given, a) }))
    .sort((x, y) => x.d - y.d)[0];
  if (closest && closest.d <= typoThreshold(expected)) {
    return {
      outcome: 'typo',
      given: rawResponse,
      expected: exercise.expected,
      isCorrect: false,
      isTypo: true,
      feedback: `${FEEDBACK.typo} Correct spelling: ${exercise.expected}`,
      explanation,
    };
  }

  // Also compare without articles: "maisom" for "la maison" is a typo.
  const strippedGiven = stripArticle(given);
  const closestStripped = accepted
    .map((a) => ({ a, d: levenshtein(strippedGiven, stripArticle(a)) }))
    .sort((x, y) => x.d - y.d)[0];
  if (strippedGiven.length >= 3 && closestStripped && closestStripped.d <= typoThreshold(stripArticle(expected))) {
    return {
      outcome: 'typo',
      given: rawResponse,
      expected: exercise.expected,
      isCorrect: false,
      isTypo: true,
      feedback: `${FEEDBACK.typo} Correct spelling: ${exercise.expected}`,
      explanation,
    };
  }

  // Loose match (accents + small typo combined) still counts as a typo.
  if (accepted.some((a) => levenshtein(normalizeLoose(rawResponse), normalizeLoose(a)) <= 1 && normalizeLoose(a).length > 4)) {
    return {
      outcome: 'typo',
      given: rawResponse,
      expected: exercise.expected,
      isCorrect: false,
      isTypo: true,
      feedback: `${FEEDBACK.typo} Correct spelling: ${exercise.expected}`,
      explanation,
    };
  }

  return {
    outcome: 'wrong',
    given: rawResponse,
    expected: exercise.expected,
    isCorrect: false,
    isTypo: false,
    feedback: FEEDBACK.wrong,
    explanation,
  };
}

/** Grade a multiple-choice / word-order selection (index or token list). */
export function gradeSelection(exercise: Exercise, selectedIndex: number, correctIndex: number): GradeResult {
  const isCorrect = selectedIndex === correctIndex;
  return {
    outcome: isCorrect ? 'correct' : 'wrong',
    given: String(selectedIndex),
    expected: exercise.expected,
    isCorrect,
    isTypo: false,
    feedback: isCorrect ? FEEDBACK.correct : `${FEEDBACK.wrong} Correct answer: ${exercise.expected}`,
    explanation: exercise.explanation,
  };
}

const ARTICLES = ['le', 'la', 'les', 'l', "l'", 'un', 'une', 'des', 'du', 'de la', 'au', 'aux'];

/** Remove a leading article from a normalized answer. */
export function stripArticle(normalized: string): string {
  for (const art of ARTICLES) {
    if (normalized.startsWith(art)) {
      const rest = normalized.slice(art.length).trim();
      if (rest.length > 0 && (art.length < 2 || normalized[art.length] === ' ' || art.endsWith("'"))) {
        return rest;
      }
    }
  }
  return normalized;
}

/** Convenience: grade against raw expected/accepted lists (used by tests and tools). */
export function gradeAnswerList(
  rawResponse: string,
  expected: string,
  accepted: string[] = [],
  explanation?: string,
): GradeResult {
  const exp = explanation && explanation.length > 0 ? explanation : `The correct answer is "${expected}".`;
  return gradeTypedAnswer(
    {
      id: 'ad-hoc',
      kind: 'translation-typed',
      itemId: 'ad-hoc',
      reviewKind: 'vocab',
      topic: 'home',
      level: 'A1',
      prompt: '',
      instruction: '',
      expected,
      accepted,
      explanation: exp,
      direction: 'en-fr',
    },
    rawResponse,
    { explanation: exp },
  );
}

/** Pretty-print a response with typography normalization (for display). */
export function displayResponse(raw: string): string {
  return normalizeTypography(raw);
}
