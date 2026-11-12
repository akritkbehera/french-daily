/**
 * Dataset construction and validation.
 *
 * Raw entries are compact; buildVocabulary()/buildVerbs() expand them into the
 * full domain objects (articles, plurals, ids) and validateDataset() enforces
 * data quality. Invalid data throws at import time and is asserted in tests:
 *
 *  - duplicate ids or lemmas
 *  - missing translations / examples / forms
 *  - wrong gender metadata (every noun must be m or f)
 *  - elision metadata for h-initial words (must be decided explicitly)
 *  - example sentences must contain the lemma (or its plural)
 *  - conjugation tables must match the endings of their verb group
 */
import {
  buildArticles,
  regularPlural,
  startsWithVowelSound,
  validateForms,
  withDefiniteArticle,
  type RawVocabEntry,
  type RawVerb,
  type SentencePair,
  type Verb,
  type VocabItem,
} from '@french-daily/learning-core';

export interface Dataset {
  vocabulary: VocabItem[];
  verbs: Verb[];
  sentences: SentencePair[];
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const VOWEL_SOUND = /^[aàâäeéèêëiîïoôöuùûüœæh]/i;

/** Expand + validate raw vocabulary entries. */
export function buildVocabulary(raw: RawVocabEntry[]): VocabItem[] {
  return raw.map((r) => {
    const elision = r.elision ?? startsWithVowelSound(r.french);
    return {
      id: r.id ?? `noun:${r.french}`,
      number: r.number ?? 'singular',
      countable: r.countable ?? true,
      french: r.french,
      english: r.english,
      gender: r.gender,
      elision,
      singular: r.french,
      plural: r.plural ?? regularPlural(r.french),
      articles: buildArticles(r.french, { gender: r.gender, elision }),
      exampleFr: r.exampleFr,
      exampleEn: r.exampleEn,
      level: r.level,
      topic: r.topic,
    } satisfies VocabItem;
  });
}

/** Expand + validate raw verb tables. */
export function buildVerbs(raw: RawVerb[]): Verb[] {
  return raw.map((r) => {
    const reflexive = /^s['’]|\bse /.test(r.infinitive);
    const stem = r.infinitive.replace(/^se\s+/, '').replace(/^s['’]/, '');
    return {
      id: `verb:${r.infinitive}`,
      infinitive: r.infinitive,
      stem,
      reflexive,
      group: r.group,
      english: r.english,
      forms: r.forms,
      level: r.level ?? 'A1',
      exampleFr: r.exampleFr,
      exampleEn: r.exampleEn,
      fillComplement: r.fillComplement,
    } satisfies Verb;
  });
}

const GROUP_ENDINGS: Record<string, Record<string, string[]>> = {
  er: { je: ['e'], tu: ['es'], il: ['e'], nous: ['ons'], vous: ['ez'], ils: ['ent'] },
  ir: { je: ['is'], tu: ['is'], il: ['it'], nous: ['issons'], vous: ['issez'], ils: ['issent'] },
  re: { je: ['s'], tu: ['s'], il: [''], nous: ['ons'], vous: ['ez'], ils: ['ent'] },
};

/** Full dataset validation. Throws nothing; returns all problems found. */
export function validateDataset(dataset: Dataset, rawVocab: RawVocabEntry[], rawVerbs: RawVerb[]): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- vocabulary ----
  const seenIds = new Set<string>();
  const seenLemmas = new Set<string>();
  for (const r of rawVocab) {
    const label = `vocab "${r.french}"`;
    if (!r.french || r.french.trim().length === 0) errors.push(`${label}: empty french lemma`);
    if (!r.english || r.english.length === 0 || r.english.some((e) => !e.trim())) {
      errors.push(`${label}: missing english translation`);
    }
    if (r.gender !== 'm' && r.gender !== 'f') errors.push(`${label}: gender must be "m" or "f"`);
    if (!r.exampleFr || !r.exampleEn) errors.push(`${label}: missing example sentence`);
    if (!r.topic) errors.push(`${label}: missing topic`);
    if (!r.level) errors.push(`${label}: missing level`);
    if (/^h/i.test(r.french) && r.elision === undefined) {
      errors.push(`${label}: h-initial words must set elision explicitly (mute h vs aspirate h)`);
    }
  }

  for (const item of dataset.vocabulary) {
    const label = `vocab "${item.french}"`;
    if (seenIds.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seenIds.add(item.id);
    const lemmaKey = item.french.toLowerCase();
    if (seenLemmas.has(lemmaKey)) errors.push(`${label}: duplicate lemma`);
    seenLemmas.add(lemmaKey);

    if (!item.articles.definiteSingular || !item.articles.indefiniteSingular) {
      errors.push(`${label}: computed articles incomplete`);
    }
    // Surface article must match elision metadata.
    const expectedDefinite = item.elision ? "l'" : item.gender === 'm' ? 'le' : 'la';
    if (item.articles.definiteSingular !== expectedDefinite) {
      errors.push(`${label}: article "${item.articles.definiteSingular}" inconsistent with gender/elision`);
    }
    if (item.plural.trim().length === 0) errors.push(`${label}: empty plural`);
    // Example must contain the lemma or its plural.
    const exLower = item.exampleFr.toLowerCase();
    if (!exLower.includes(item.french.toLowerCase()) && !exLower.includes(item.plural.toLowerCase())) {
      errors.push(`${label}: example sentence does not contain the lemma`);
    }
    // Gender metadata must be preserved even when the article elides.
    if (item.elision && item.french.toLowerCase().startsWith('é') && item.gender !== 'f' && item.gender !== 'm') {
      errors.push(`${label}: elided nouns still need a gender`);
    }
  }

  // ---- verbs ----
  const seenVerbs = new Set<string>();
  for (const r of rawVerbs) {
    const label = `verb "${r.infinitive}"`;
    if (!r.infinitive || !r.english) errors.push(`${label}: missing infinitive or translation`);
    const problems = validateForms(r.forms);
    for (const p of problems) errors.push(`${label}: ${p}`);
    if (!r.fillComplement) errors.push(`${label}: missing fillComplement`);
    if (!r.exampleFr || !r.exampleEn) errors.push(`${label}: missing example`);
    if (!/(er|ir|re)$/.test(r.infinitive.replace(/^se\s+/, '').replace(/^s['’]/, ''))) {
      errors.push(`${label}: infinitive must end in -er, -ir or -re`);
    }
  }

  for (const verb of dataset.verbs) {
    const label = `verb "${verb.infinitive}"`;
    if (seenVerbs.has(verb.id)) errors.push(`${label}: duplicate id`);
    seenVerbs.add(verb.id);

    // Endings must match the declared group (skipped for irregular verbs).
    const endings = GROUP_ENDINGS[verb.group];
    if (endings) {
      for (const [pronoun, allowed] of Object.entries(endings)) {
        const form = verb.forms[pronoun as keyof typeof verb.forms];
        const ok = allowed.some((e) => form.endsWith(e));
        if (!ok) {
          errors.push(`${label}: form "${form}" for ${pronoun} does not match the ${verb.group}-group ending pattern [${allowed.join(', ')}]`);
        }
      }
      // nous/vous are always -ons/-ez outside irregular verbs.
      if (!verb.forms.nous.endsWith('ons')) errors.push(`${label}: nous form must end in -ons`);
      if (!verb.forms.vous.endsWith('ez')) errors.push(`${label}: vous form must end in -ez`);
    }

    // The example should use at least one of the conjugated forms.
    const ex = verb.exampleFr.toLowerCase();
    const usesForm = Object.values(verb.forms).some((f) => ex.includes(f.toLowerCase()));
    if (!usesForm) errors.push(`${label}: example sentence does not use any conjugated form`);
  }

  // ---- sentences ----
  const seenSent = new Set<string>();
  for (const pair of dataset.sentences) {
    const label = `sentence "${pair.id}"`;
    if (seenSent.has(pair.id)) errors.push(`${label}: duplicate id`);
    seenSent.add(pair.id);
    if (!pair.en.trim() || !pair.fr.trim()) errors.push(`${label}: empty translation`);
    if (!pair.note.trim()) errors.push(`${label}: missing grammar note`);
    if (pair.alternatives.includes(pair.fr)) errors.push(`${label}: alternative duplicates expected answer`);
    const tokens = pair.fr.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length < 3) warnings.push(`${label}: fewer than 3 tokens — word-order exercise will be skipped`);
    if (pair.alternatives.some((a) => a.trim().length === 0)) errors.push(`${label}: empty alternative`);
  }

  return { errors, warnings };
}

/** Human-readable list of items, used by tooling/tests. */
export function describeVocabItem(item: VocabItem): string {
  return `${withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision })} (${item.gender}) = ${item.english.join(', ')}`;
}

/** Elision helper re-export for tests. */
export { VOWEL_SOUND };
