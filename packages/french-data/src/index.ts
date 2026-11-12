/**
 * @french-daily/french-data — curated A1–B1 French dataset for French Daily.
 *
 * The data is validated at import time: any malformed record, duplicate lemma,
 * missing translation or inconsistent gender/article metadata throws.
 * See docs/data-model.md for the schema and validation rules.
 */
import type { ExerciseSources, SentencePair, Verb, VocabItem } from '@french-daily/learning-core';
import { vocabularyPartA } from './vocab-part-a';
import { vocabularyPartB } from './vocab-part-b';
import { rawVerbs } from './verbs';
import { rawSentences } from './sentences';
import { buildVerbs, buildVocabulary, validateDataset, type Dataset, type ValidationReport } from './validate';

export { vocabularyPartA, vocabularyPartB, rawVerbs, rawSentences };
export * from './validate';

/** Raw vocabulary entries (compact authoring form). */
export const rawVocabulary = [...vocabularyPartA, ...vocabularyPartB];

/** Expanded, validated dataset. */
export const vocabulary: VocabItem[] = buildVocabulary(rawVocabulary);
export const verbs: Verb[] = buildVerbs(rawVerbs);
export const sentences: SentencePair[] = rawSentences;

/** Everything the exercise engine needs as a content source. */
export const sources: ExerciseSources = { vocabulary, verbs, sentences };

/** Run full dataset validation (used by tests and `npm run check`). */
export function validateAll(): ValidationReport {
  return validateDataset({ vocabulary, verbs, sentences } satisfies Dataset, rawVocabulary, rawVerbs);
}

// Fail fast on invalid data — this runs once at import.
const report = validateAll();
if (report.errors.length > 0) {
  throw new Error(`french-data validation failed:\n- ${report.errors.join('\n- ')}`);
}

/** Ids of irregular verbs (used for challenge generation). */
export const irregularVerbIds: Set<string> = new Set(
  verbs.filter((v) => v.group === 'irregular').map((v) => v.id),
);

/** Fast lookups. */
export const vocabById: Map<string, VocabItem> = new Map(vocabulary.map((v) => [v.id, v]));
export const verbById: Map<string, Verb> = new Map(verbs.map((v) => [v.id, v]));
export const sentenceById: Map<string, SentencePair> = new Map(sentences.map((s) => [s.id, s]));

/** Human-readable label for any content id (dashboard lists). */
export function labelForContentId(itemId: string): string {
  const v = vocabById.get(itemId);
  if (v) return `${v.french} (${v.english[0]})`;
  const verb = verbById.get(itemId);
  if (verb) return `${verb.infinitive} (${verb.english})`;
  const s = sentenceById.get(itemId);
  if (s) return s.en;
  return itemId;
}
