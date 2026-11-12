/**
 * Conjugation rules for the French present indicative.
 *
 * Conjugation *tables* live in @french-daily/french-data (explicit, validated).
 * This module explains *why* an answer is wrong and derives regular forms for
 * validation and for the conjugation-rule explanations shown to learners.
 */
import type { PronounKey, VerbGroup } from './types';
import { PRONOUN_LABELS } from './types';

const VOWEL = 'aàâäeéèêëiîïoôöuùûüœæh';

/** Display a subject + verb form with correct elision, e.g. "j'aime", "nous allons". */
export function conjugated(pronoun: PronounKey, form: string, reflexive = false): string {
  const subj = PRONOUN_LABELS[pronoun].split('/')[0];
  const se = reflexive ? reflexivePronoun(pronoun) + ' ' : '';
  const needsElision = subj === 'je' && VOWEL.includes(form.charAt(0));
  const subject = needsElision ? "j'" : subj === 'je' ? 'je ' : `${subj} `;
  return `${subject}${se}${form}`.replace(/\s+/g, ' ').trim();
}

export function reflexivePronoun(pronoun: PronounKey): string {
  switch (pronoun) {
    case 'je':
      return 'me';
    case 'tu':
      return 'te';
    case 'il':
      return 'se';
    case 'nous':
      return 'nous';
    case 'vous':
      return 'vous';
    case 'ils':
      return 'se';
  }
}

/** Regular present-tense stem + ending rules, used to explain errors. */
export function regularEnding(group: VerbGroup, pronoun: PronounKey): string | null {
  switch (group) {
    case 'er':
      return { je: 'e', tu: 'es', il: 'e', nous: 'ons', vous: 'ez', ils: 'ent' }[pronoun];
    case 'ir':
      return { je: 'is', tu: 'is', il: 'it', nous: 'issons', vous: 'issez', ils: 'issent' }[pronoun];
    case 're':
      return { je: 's', tu: 's', il: '', nous: 'ons', vous: 'ez', ils: 'ent' }[pronoun];
    case 'irregular':
      return null;
  }
}

/** Derive a regular present-tense form (returns null for irregular verbs). */
export function regularForm(infinitive: string, group: VerbGroup, pronoun: PronounKey): string | null {
  const ending = regularEnding(group, pronoun);
  if (ending === null) return null;
  const stem = infinitive.replace(/(er|ir|re)$/, '');
  if (!stem) return null;
  let s = stem;
  // -ger → geons/gez ; -cer → ceons/ceons... (orthographic rules)
  if (ending.startsWith('o') && s.endsWith('g')) s = `${s}e`;
  if (ending.startsWith('o') && s.endsWith('c')) s = `${s.slice(0, -1)}ç`;
  return `${s}${ending}`;
}

/** Explanation of the conjugation rule for a verb/pronoun pair. */
export function conjugationExplanation(infinitive: string, group: VerbGroup, pronoun: PronounKey, correctForm: string): string {
  const subject = conjugated(pronoun, correctForm);
  const regular = regularForm(infinitive, group, pronoun);
  const pattern = group === 'er' ? '-er' : group === 'ir' ? '-ir' : group === 're' ? '-re' : 'irregular';
  if (regular && regular === correctForm) {
    return `Regular ${pattern} verb: the form for ${PRONOUN_LABELS[pronoun]} is "${correctForm}". Full form: ${subject}.`;
  }
  if (group === 'irregular') {
    return `"${infinitive}" is irregular in the present tense — its forms must be learned individually. The form for ${PRONOUN_LABELS[pronoun]} is "${correctForm}" (${subject}).`;
  }
  return `"${infinitive}" follows the ${pattern} pattern but has an orthographic tweak. The form for ${PRONOUN_LABELS[pronoun]} is "${correctForm}" (${subject}).`;
}

/** Validate a conjugation table: every pronoun must have a non-empty form. */
export function validateForms(forms: Partial<Record<PronounKey, string>>): string[] {
  const problems: string[] = [];
  for (const p of ['je', 'tu', 'il', 'nous', 'vous', 'ils'] as PronounKey[]) {
    const f = forms[p];
    if (!f || f.trim().length === 0) problems.push(`missing form for ${p}`);
  }
  return problems;
}
