/**
 * @french-daily/learning-core — framework-agnostic learning engine.
 *
 * Everything here is pure TypeScript with no DOM or storage dependencies:
 * text normalization, deterministic grading, SM-2 spaced repetition,
 * exercise generation, session composition and progress analytics.
 * See docs/learning-engine.md for the full specification.
 */

export * from './types';
export * from './dates';
export * from './text';
export * from './articles';
export * from './grading';
export * from './conjugation';
export * from './fsrs';
export * from './spacedRepetition';
export * from './random';
export * from './exercises';
export * from './session';
export * from './progress';
export * from './challenges';
export * from './metrics';
