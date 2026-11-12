/**
 * Text normalization + deterministic grading tests.
 */
import { describe, expect, it } from 'vitest';
import {
  differsOnlyByAccents,
  foldAccents,
  gradeAnswerList,
  levenshtein,
  normalizeAnswer,
  normalizeTypography,
  tokenizeSentence,
  typoThreshold,
} from '@french-daily/learning-core';

describe('text normalization', () => {
  it('normalizes typographic apostrophes and whitespace', () => {
    expect(normalizeTypography('J\u2019ai  faim')).toBe("J'ai faim");
    expect(normalizeAnswer('  La Maison. ')).toBe('la maison');
    expect(normalizeAnswer('la maison!')).toBe('la maison');
  });

  it('folds accents without changing letters', () => {
    expect(foldAccents('école')).toBe('ecole');
    expect(foldAccents('ça va')).toBe('ca va');
    expect(foldAccents('sœur')).toBe('soeur');
    expect(foldAccents('ÉTÉ')).toBe('ETE');
  });

  it('detects accent-only differences', () => {
    expect(differsOnlyByAccents('ecole', 'école')).toBe(true);
    expect(differsOnlyByAccents('maison', 'maison')).toBe(false);
    expect(differsOnlyByAccents('maison', 'chaise')).toBe(false);
  });

  it('computes levenshtein distance', () => {
    expect(levenshtein('maison', 'maison')).toBe(0);
    expect(levenshtein('maison', 'maisom')).toBe(1);
    expect(levenshtein('chat', 'chien')).toBeGreaterThan(1);
  });

  it('scales typo thresholds with length', () => {
    expect(typoThreshold('le')).toBe(0);
    expect(typoThreshold('maison')).toBe(1);
    expect(typoThreshold('petit-déjeuner')).toBe(2);
  });

  it('tokenizes sentences keeping elided articles together', () => {
    expect(tokenizeSentence("L'école est grande.")).toEqual(["L'école", 'est', 'grande']);
  });
});

describe('answer grading', () => {
  it('accepts the expected answer and curated alternatives', () => {
    const g1 = gradeAnswerList('la maison', 'la maison', ['une maison']);
    expect(g1.isCorrect).toBe(true);
    expect(g1.outcome).toBe('correct');

    const g2 = gradeAnswerList('Une Maison', 'la maison', ['une maison']);
    expect(g2.isCorrect).toBe(true);
  });

  it('flags accent-only mistakes as typos, not grammar errors', () => {
    const g = gradeAnswerList("l'ecole", "l'école", []);
    expect(g.isCorrect).toBe(false);
    expect(g.outcome).toBe('accent');
    expect(g.isTypo).toBe(true);
    expect(g.feedback).toContain('accents');
    expect(g.feedback).toContain("l'école");
  });

  it('flags a missing article separately', () => {
    const g = gradeAnswerList('maison', 'la maison', []);
    expect(g.outcome).toBe('article');
    expect(g.isTypo).toBe(true);
    expect(g.feedback).toContain('la maison');
  });

  it('flags small spelling mistakes as typos', () => {
    const g = gradeAnswerList('maisom', 'la maison', []);
    expect(g.outcome).toBe('typo');
    expect(g.isTypo).toBe(true);
  });

  it('reports genuinely wrong answers as wrong', () => {
    const g = gradeAnswerList('le jardin', 'la maison');
    expect(g.outcome).toBe('wrong');
    expect(g.isTypo).toBe(false);
    expect(g.explanation.length).toBeGreaterThan(0);
  });

  it('rejects empty answers', () => {
    const g = gradeAnswerList('   ', 'la maison', []);
    expect(g.outcome).toBe('wrong');
    expect(g.feedback).toContain('No answer');
  });

  it('always explains incorrect answers', () => {
    const g = gradeAnswerList('xyzzy', 'prendre', [], 'irregular verb');
    expect(g.explanation).toBe('irregular verb');
  });
});
