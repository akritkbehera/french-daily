/**
 * Exercise generation.
 *
 * Generators turn curated content (vocab items, verb tables, sentence pairs)
 * into exercises. All randomness is injectable and seeded, so generation is
 * reproducible in tests. Grading is deterministic — expected answers and
 * accepted alternatives come from the dataset, never from a model.
 */
import { articleOptionsFor, buildArticles, withDefiniteArticle, withIndefiniteArticle } from './articles';
import { conjugationExplanation, reflexivePronoun } from './conjugation';
import { createRng, type Rng, sample, shuffle } from './random';
import { tokenizeSentence } from './text';
import type {
  Exercise,
  ExerciseKind,
  GenderSelectExercise,
  Level,
  MultipleChoiceExercise,
  PronounKey,
  SentenceConstructionExercise,
  SentencePair,
  Topic,
  TypedExercise,
  Verb,
  VocabItem,
  WordOrderExercise,
} from './types';
import { PRONOUNS, PRONOUN_LABELS } from './types';

export interface ExerciseSources {
  vocabulary: VocabItem[];
  verbs: Verb[];
  sentences: SentencePair[];
}

const VOWEL_SOUND = /^[aàâäeéèêëiîïoôöuùûüœæh]/i;

function uid(itemId: string, kind: ExerciseKind, variant = ''): string {
  return `${itemId}::${kind}${variant ? `::${variant}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* Vocabulary exercises                                                */
/* ------------------------------------------------------------------ */

/** English → French typed translation ("The house" → "la maison"). */
export function makeEnToFrTranslation(item: VocabItem, rng: Rng): TypedExercise {
  const useDefinite = item.countable === false || rng() < 0.6;
  const english = item.english[0];
  const promptEn = useDefinite ? `The ${english}` : item.number === 'plural' ? `Some ${english}` : indefiniteEnglish(english);
  const expected = item.number === 'plural' ? `${useDefinite ? 'les' : 'des'} ${item.french}` : useDefinite
    ? withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision })
    : withIndefiniteArticle(item.french, { gender: item.gender, elision: item.elision });
  const altExpected = item.number === 'plural' ? `${useDefinite ? 'des' : 'les'} ${item.french}` : useDefinite
    ? withIndefiniteArticle(item.french, { gender: item.gender, elision: item.elision })
    : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision });
  return {
    id: uid(item.id, 'translation-typed', useDefinite ? 'def' : 'indef'),
    kind: 'translation-typed',
    itemId: item.id,
    reviewKind: 'vocab',
    topic: item.topic,
    level: item.level,
    instruction: 'Translate into French',
    prompt: promptEn,
    expected,
    // The alternative article is *not* accepted: the article carries the gender.
    accepted: [],
    explanation: `${item.french} is ${item.gender === 'm' ? 'masculine' : 'feminine'} (${(item.number === 'plural' ? `les ${item.french}` : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision }))} / ${altExpected}). Example: ${item.exampleFr} — ${item.exampleEn}`,
    hint: item.topic,
    direction: 'en-fr',
  };
}

function indefiniteEnglish(english: string): string {
  return VOWEL_SOUND.test(english) ? `An ${english}` : `A ${english}`;
}

/** French → English typed translation ("le jardin" → "the garden"). */
export function makeFrToEnTranslation(item: VocabItem): TypedExercise {
  const prompt = item.number === 'plural' ? `les ${item.french}` : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision });
  const expected = `the ${item.english[0]}`;
  const accepted = item.english.flatMap((e) => [`the ${e}`, e]);
  return {
    id: uid(item.id, 'translation-typed', 'fren'),
    kind: 'translation-typed',
    itemId: item.id,
    reviewKind: 'vocab',
    topic: item.topic,
    level: item.level,
    instruction: 'Translate into English',
    prompt,
    expected,
    accepted: accepted.filter((a) => a !== expected),
    explanation: `${prompt} = ${expected}. Example: ${item.exampleFr} — ${item.exampleEn}`,
    direction: 'fr-en',
  };
}

/** Gender/article practice: "___ voiture" → "la". */
export function makeGenderExercise(
  item: VocabItem,
  articleType: 'definite' | 'indefinite' | 'definite-plural' | 'indefinite-plural' = 'definite',
): GenderSelectExercise {
  if (item.number === 'plural' && !articleType.endsWith('plural')) articleType = articleType === 'definite' ? 'definite-plural' : 'indefinite-plural';
  const articles = buildArticles(item.french, { gender: item.gender, elision: item.elision });
  const expected = articleOptionsFor(articles, articleType);
  const noun = articleType.endsWith('plural') ? item.plural : item.singular;
  const options = ['le', 'la', "l'", 'les', 'un', 'une', 'des'];
  return {
    id: uid(item.id, 'gender-select', articleType),
    kind: 'gender-select',
    itemId: item.id,
    reviewKind: 'vocab',
    topic: item.topic,
    level: item.level,
    instruction:
      articleType === 'definite' || articleType === 'definite-plural'
        ? 'Choose the definite article'
        : 'Choose the indefinite article',
    prompt: `___ ${noun}`,
    expected,
    accepted: expected === "l'" ? ["l", "l’"] : [],
    explanation: `${item.french} is ${item.gender === 'm' ? 'masculine' : 'feminine'} (${item.number === 'plural' ? 'des' : item.gender === 'm' ? 'un' : 'une'} ${item.french}); the definite article is ${articles.definiteSingular} → ${(item.number === 'plural' ? `les ${item.french}` : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision }))}. Example: ${item.exampleFr}`,
    hint: undefined,
    articleType,
    options,
  };
}

/** Multiple-choice translation with curated distractors from the same topic. */
export function makeVocabMultipleChoice(
  item: VocabItem,
  pool: readonly VocabItem[],
  rng: Rng,
  direction: 'en-fr' | 'fr-en' = 'fr-en',
): MultipleChoiceExercise {
  const sameTopic = pool.filter((v) => v.id !== item.id && v.topic === item.topic);
  const others = pool.filter((v) => v.id !== item.id && v.topic !== item.topic);
  const distractorPool = sameTopic.length >= 3 ? sameTopic : [...sameTopic, ...others];
  const distractors = sample(distractorPool, 3, rng).map((d) =>
    direction === 'fr-en' ? `the ${d.english[0]}` : (d.number === 'plural' ? `les ${d.french}` : withDefiniteArticle(d.french, { gender: d.gender, elision: d.elision })),
  );
  const expected =
    direction === 'fr-en'
      ? `the ${item.english[0]}`
      : (item.number === 'plural' ? `les ${item.french}` : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision }));
  const options = shuffle([expected, ...distractors], rng);
  return {
    id: uid(item.id, 'multiple-choice', direction),
    kind: 'multiple-choice',
    itemId: item.id,
    reviewKind: 'vocab',
    topic: item.topic,
    level: item.level,
    instruction: direction === 'fr-en' ? 'Choose the English translation' : 'Choose the French translation',
    prompt:
      direction === 'fr-en'
        ? (item.number === 'plural' ? `les ${item.french}` : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision }))
        : `the ${item.english[0]}`,
    expected,
    accepted: [],
    explanation: `${(item.number === 'plural' ? `les ${item.french}` : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision }))} = the ${item.english[0]}. Example: ${item.exampleFr}`,
    options,
    correctIndex: options.indexOf(expected),
  };
}

/* ------------------------------------------------------------------ */
/* Verb exercises                                                      */
/* ------------------------------------------------------------------ */

/** Fill-in-the-blank: "Nous ___ (aller) au cinéma." → "allons". */
export function makeConjugationFill(verb: Verb, pronoun: PronounKey, complement: string): Exercise {
  const form = verb.forms[pronoun];
  const subjectLabel = PRONOUN_LABELS[pronoun].split('/')[0];
  const ref = reflexivePronoun(pronoun);
  const reflexivePart = verb.reflexive ? ` ${VOWEL_SOUND.test(form) && ['me','te','se'].includes(ref) ? ref.slice(0,-1) + '’' : ref}` : '';
  const subject = pronoun === 'je' && !verb.reflexive && VOWEL_SOUND.test(form) ? "j’" : subjectLabel;
  const prompt = `${subject}${reflexivePart}${subject.endsWith('’') || reflexivePart.endsWith('’') ? '' : ' '}___ (${verb.infinitive}) ${complement}`.replace(/\s+/g, ' ').trim();
  return {
    id: uid(verb.id, 'conjugation-fill', pronoun),
    kind: 'conjugation-fill',
    itemId: verb.id,
    reviewKind: 'verb',
    topic: 'time',
    level: verb.level,
    instruction: 'Complete with the correct present-tense form',
    prompt,
    expected: form,
    accepted: [],
    explanation: conjugationExplanation(verb.infinitive, verb.group, pronoun, form),
    hint: `${verb.infinitive} · ${PRONOUN_LABELS[pronoun]}`,
    infinitive: verb.infinitive,
    pronoun,
  };
}

/** Direct conjugation: "Conjugate prendre for vous." → "prenez". */
export function makeConjugationDirect(verb: Verb, pronoun: PronounKey): Exercise {
  const form = verb.forms[pronoun];
  return {
    id: uid(verb.id, 'conjugation-direct', pronoun),
    kind: 'conjugation-direct',
    itemId: verb.id,
    reviewKind: 'verb',
    topic: 'time',
    level: verb.level,
    instruction: 'Type the present-tense form',
    prompt: `Conjugate ${verb.infinitive} for ${PRONOUN_LABELS[pronoun]}.`,
    expected: form,
    accepted: [],
    explanation: conjugationExplanation(verb.infinitive, verb.group, pronoun, form),
    hint: verb.english,
    infinitive: verb.infinitive,
    pronoun,
  };
}

/** Conjugation multiple choice with plausible distractor forms. */
export function makeConjugationMultipleChoice(verb: Verb, pronoun: PronounKey, rng: Rng): MultipleChoiceExercise {
  const form = verb.forms[pronoun];
  const otherForms = Array.from(new Set(Object.values(verb.forms).filter((f) => f !== form)));
  const distractors = sample([...otherForms, `${form}s`, `${form}e`, `${form}ons`].filter((f) => f !== form), 3, rng);
  const options = shuffle([form, ...distractors], rng);
  return {
    id: uid(verb.id, 'multiple-choice', pronoun),
    kind: 'multiple-choice',
    itemId: verb.id,
    reviewKind: 'verb',
    topic: 'time',
    level: verb.level,
    instruction: 'Choose the correct present-tense form',
    prompt: `${PRONOUN_LABELS[pronoun].split('/')[0]} ___ (${verb.infinitive})`,
    expected: form,
    accepted: [],
    explanation: conjugationExplanation(verb.infinitive, verb.group, pronoun, form),
    options,
    correctIndex: options.indexOf(form),
  };
}

/* ------------------------------------------------------------------ */
/* Sentence exercises                                                  */
/* ------------------------------------------------------------------ */

/** Sentence construction: "Translate: I eat breakfast at eight." with curated alternatives. */
export function makeSentenceConstruction(
  pair: SentencePair,
  direction: 'en-fr' | 'fr-en' = 'en-fr',
): SentenceConstructionExercise {
  const expected = direction === 'en-fr' ? pair.fr : pair.en;
  const accepted = direction === 'en-fr' ? pair.alternatives : [];
  return {
    id: uid(pair.id, 'sentence-construction', direction),
    kind: 'sentence-construction',
    itemId: pair.id,
    reviewKind: 'sentence',
    topic: pair.topic,
    level: pair.level,
    instruction: direction === 'en-fr' ? 'Translate the sentence into French' : 'Translate the sentence into English',
    prompt: direction === 'en-fr' ? `Translate: ${pair.en}` : `Translate: ${pair.fr}`,
    expected,
    accepted,
    explanation: `${pair.en} = ${pair.fr}. ${pair.note}`,
    direction,
  };
}

/** Word ordering: arrange shuffled tiles into the French sentence. */
export function makeWordOrder(pair: SentencePair, rng: Rng): WordOrderExercise {
  const correctOrder = tokenizeSentence(pair.fr);
  let tokens = shuffle(correctOrder, rng);
  // Avoid a degenerate "already correct" ordering.
  let guard = 0;
  while (tokens.join(' ') === correctOrder.join(' ') && guard++ < 5) {
    tokens = shuffle(correctOrder, rng);
  }
  return {
    id: uid(pair.id, 'word-order'),
    kind: 'word-order',
    itemId: pair.id,
    reviewKind: 'sentence',
    topic: pair.topic,
    level: pair.level,
    instruction: 'Put the words in the correct order',
    prompt: pair.en,
    expected: correctOrder.join(' '),
    accepted: [pair.fr],
    explanation: `${pair.en} = ${pair.fr}. ${pair.note}`,
    tokens,
    correctOrder,
  };
}

/* ------------------------------------------------------------------ */
/* Session-level generation helpers                                    */
/* ------------------------------------------------------------------ */

export interface FilterOptions {
  topics: Topic[] | 'all';
  levels: Level[] | 'all';
  kinds: ExerciseKind[] | 'all';
}

function passesFilter(topic: Topic, level: Level, kind: ExerciseKind, filter: FilterOptions): boolean {
  if (filter.topics !== 'all' && !filter.topics.includes(topic)) return false;
  if (filter.levels !== 'all' && !filter.levels.includes(level)) return false;
  if (filter.kinds !== 'all' && !filter.kinds.includes(kind)) return false;
  return true;
}

/** Generate one exercise for a vocabulary item using a randomly chosen suitable kind. */
export function generateVocabExercise(
  item: VocabItem,
  pool: readonly VocabItem[],
  rng: Rng,
  filter: FilterOptions,
): Exercise | null {
  const candidates: Array<() => Exercise> = [];
  if (passesFilter(item.topic, item.level, 'translation-typed', filter)) {
    candidates.push(() => makeEnToFrTranslation(item, rng));
    candidates.push(() => makeFrToEnTranslation(item));
  }
  if (passesFilter(item.topic, item.level, 'gender-select', filter)) {
    candidates.push(() => makeGenderExercise(item, 'definite'));
    if (item.countable !== false) candidates.push(() => makeGenderExercise(item, 'indefinite'));
  }
  if (passesFilter(item.topic, item.level, 'multiple-choice', filter)) {
    candidates.push(() => makeVocabMultipleChoice(item, pool, rng, 'fr-en'));
    candidates.push(() => makeVocabMultipleChoice(item, pool, rng, 'en-fr'));
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)]();
}

/** Generate one exercise for a verb. */
export function generateVerbExercise(verb: Verb, complement: string, rng: Rng, filter: FilterOptions): Exercise | null {
  const pronoun = PRONOUNS[Math.floor(rng() * PRONOUNS.length)];
  const candidates: Array<() => Exercise> = [];
  if (passesFilter('time', verb.level, 'conjugation-fill', filter)) {
    candidates.push(() => makeConjugationFill(verb, pronoun, complement));
  }
  if (passesFilter('time', verb.level, 'conjugation-direct', filter)) {
    candidates.push(() => makeConjugationDirect(verb, pronoun));
  }
  if (passesFilter('time', verb.level, 'multiple-choice', filter)) {
    candidates.push(() => makeConjugationMultipleChoice(verb, pronoun, rng));
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)]();
}

/** Generate one sentence exercise. */
export function generateSentenceExercise(pair: SentencePair, rng: Rng, filter: FilterOptions): Exercise | null {
  const candidates: Array<() => Exercise> = [];
  if (passesFilter(pair.topic, pair.level, 'sentence-construction', filter)) {
    candidates.push(() => makeSentenceConstruction(pair, 'en-fr'));
    candidates.push(() => makeSentenceConstruction(pair, 'fr-en'));
  }
  // Word ordering needs at least 3 tiles to be meaningful.
  if (passesFilter(pair.topic, pair.level, 'word-order', filter) && tokenizeSentence(pair.fr).length >= 3) {
    candidates.push(() => makeWordOrder(pair, rng));
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)]();
}

/** Deterministic RNG from a string seed (session ids, exercise ids). */
export function rngFromSeed(seed: string | number): Rng {
  const n = typeof seed === 'number' ? seed : hashString(seed);
  return createRng(n);
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** True when the prompt starts with a vowel sound (for display hints like "An apple"). */
export function startsWithVowelSoundEn(word: string): boolean {
  return VOWEL_SOUND.test(word);
}
