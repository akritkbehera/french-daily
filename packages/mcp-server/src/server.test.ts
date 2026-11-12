/**
 * MCP server smoke tests: the stdio protocol surface and tool semantics.
 * (Full protocol tests run the built server; these verify the engine
 * contracts the tools expose.)
 */
import { describe, expect, it } from 'vitest';
import { gradeAnswerList, conjugationExplanation, fsrsReview, computeLearningMetrics } from '@french-daily/learning-core';
import { vocabulary, verbs, sentences } from '@french-daily/french-data';

describe('MCP tool contracts', () => {
  it('lookup data supports word search', () => {
    const hits = vocabulary.filter((v) => v.french.includes('maison') || v.english.some((e) => e.includes('house')));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].gender).toBe('f');
  });

  it('conjugate explains forms the way the tool returns them', () => {
    const explanation = conjugationExplanation('être', 'irregular', 'je', 'suis');
    expect(explanation).toContain('irregular');
  });

  it('grade_answer distinguishes accent mistakes from real errors', () => {
    const accent = gradeAnswerList("l'ecole", "l'école", [], 'note');
    expect(accent.isCorrect).toBe(false);
    expect(accent.outcome).toBe('accent');

    const wrong = gradeAnswerList('zzz', "l'école", [], 'note');
    expect(wrong.outcome).toBe('wrong');

    const right = gradeAnswerList("l'école", "l'école", [], 'note');
    expect(right.isCorrect).toBe(true);
    expect(right.outcome).toBe('correct');
  });

  it('schedule_review computes FSRS state', () => {
    const result = fsrsReview(null, 3, 0, 0.9);
    expect(result.state.stability).toBeGreaterThan(0);
    expect(result.interval).toBeGreaterThan(0);
  });

  it('study_stats shapes separate learning from engagement', () => {
    const learning = computeLearningMetrics([], new Map());
    expect(learning).toHaveProperty('accuracy');
    expect(learning).toHaveProperty('estimatedRetention');
  });

  it('the dataset is complete for the tools', () => {
    expect(vocabulary.length).toBeGreaterThanOrEqual(300);
    expect(verbs.length).toBeGreaterThanOrEqual(60);
    expect(sentences.length).toBeGreaterThanOrEqual(50);
    // Required verbs present for conjugate lookups.
    for (const inf of ['être', 'avoir', 'aller', 'faire', 'se lever', 'manger', 'vendre']) {
      expect(verbs.some((v) => v.infinitive === inf)).toBe(true);
    }
  });
});
