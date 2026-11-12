/**
 * Article computation for French nouns.
 *
 * Grammatical gender (m/f) is stored explicitly and is independent of the
 * surface article: "école" is feminine but surfaces as "l'école" because the
 * definite article elides before a vowel sound.
 */
import type { ArticleForms, Gender } from './types';

const VOWELS = 'aàâäeéèêëiîïoôöuùûüœæh';

/** True when a word takes elided articles (starts with a vowel sound or mute h). */
export function startsWithVowelSound(word: string): boolean {
  const first = word.trim().toLowerCase().charAt(0);
  return VOWELS.includes(first);
}

export interface ArticleOptions {
  gender: Gender;
  /** Force elision (needed for mute-h words like "homme"); defaults to vowel detection. */
  elision?: boolean;
}

/** Build the four article surface forms for a noun. */
export function buildArticles(french: string, opts: ArticleOptions): ArticleForms {
  const elision = opts.elision ?? startsWithVowelSound(french);
  const definiteSingular = elision ? "l'" : opts.gender === 'm' ? 'le' : 'la';
  return {
    definiteSingular,
    definiteSingularWithSpace: definiteSingular,
    indefiniteSingular: opts.gender === 'm' ? 'un' : 'une',
    definitePlural: 'les',
    indefinitePlural: 'des',
  };
}

/** The definite article + noun as it is written, e.g. "la maison" / "l'école". */
export function withDefiniteArticle(french: string, opts: ArticleOptions): string {
  const a = buildArticles(french, opts).definiteSingular;
  return a === "l'" ? `l'${french}` : `${a} ${french}`;
}

/** The indefinite article + noun, e.g. "une voiture". */
export function withIndefiniteArticle(french: string, opts: ArticleOptions): string {
  return `${buildArticles(french, opts).indefiniteSingular} ${french}`;
}

/** Regular French plural (with the common -eau/-eu/-al/-s/-x rules). */
export function regularPlural(french: string): string {
  const spaceIdx = french.lastIndexOf(' ');
  if (spaceIdx > 0) {
    // Multiword nouns: the rule applies to the final word ("salle de bains" overrides this).
    return `${french.slice(0, spaceIdx + 1)}${regularPlural(french.slice(spaceIdx + 1))}`;
  }
  if (/(eau|eu|au)$/i.test(french)) return `${french}x`;
  if (/al$/i.test(french) && !/bal|carnaval|festival|chacal|cal|régal|mal$/i.test(french)) {
    return `${french.slice(0, -1)}ux`;
  }
  if (/(s|x|z)$/i.test(french)) return french;
  return `${french}s`;
}

/** All article options a learner can be asked to produce for an item. */
export function articleOptionsFor(
  articles: ArticleForms,
  articleType: 'definite' | 'indefinite' | 'definite-plural' | 'indefinite-plural',
): string {
  switch (articleType) {
    case 'definite':
      return articles.definiteSingular;
    case 'indefinite':
      return articles.indefiniteSingular;
    case 'definite-plural':
      return articles.definitePlural;
    case 'indefinite-plural':
      return articles.indefinitePlural;
  }
}
