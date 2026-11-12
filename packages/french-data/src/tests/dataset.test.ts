/**
 * Dataset validation tests — the safety net for the curated content.
 */
import { describe, expect, it } from 'vitest';
import {
  irregularVerbIds,
  labelForContentId,
  rawVocabulary,
  rawVerbs,
  sentences,
  sources,
  validateAll,
  validateDataset,
  verbs,
  vocabulary,
  vocabById,
  verbById,
} from '@french-daily/french-data';
import { PRONOUNS, withDefiniteArticle, type PronounKey } from '@french-daily/learning-core';

describe('dataset validation', () => {
  const report = validateAll();

  it('has no validation errors', () => {
    expect(report.errors).toEqual([]);
  });

  it('has at least 300 vocabulary entries', () => {
    expect(vocabulary.length).toBeGreaterThanOrEqual(300);
  });

  it('has at least 60 verbs', () => {
    expect(verbs.length).toBeGreaterThanOrEqual(60);
  });

  it('has at least 40 sentence pairs', () => {
    expect(sentences.length).toBeGreaterThanOrEqual(40);
  });

  it('contains the required verbs from the specification', () => {
    const required = [
      'être', 'avoir', 'aller', 'faire', 'venir', 'prendre', 'pouvoir', 'vouloir', 'devoir',
      'savoir', 'voir', 'dire', 'mettre', 'partir', 'sortir', 'dormir', 'manger', 'commencer',
      'finir', 'vendre', 'se lever', 'se laver',
    ];
    for (const inf of required) {
      expect(verbById.has(`verb:${inf}`), `missing verb ${inf}`).toBe(true);
    }
  });

  it('every verb has all six pronoun forms', () => {
    for (const verb of verbs) {
      for (const p of PRONOUNS) {
        expect(verb.forms[p as PronounKey], `${verb.infinitive}.${p}`).toBeTruthy();
      }
    }
  });

  it('marks irregular verbs', () => {
    expect(irregularVerbIds.size).toBeGreaterThan(15);
    expect(verbs.find((v) => v.infinitive === 'aller')!.group).toBe('irregular');
    expect(verbs.find((v) => v.infinitive === 'parler')!.group).toBe('er');
    expect(verbs.find((v) => v.infinitive === 'finir')!.group).toBe('ir');
    expect(verbs.find((v) => v.infinitive === 'vendre')!.group).toBe('re');
    expect(verbs.find((v) => v.infinitive === 'se lever')!.reflexive).toBe(true);
  });

  it('spot-checks conjugation correctness', () => {
    const être = verbById.get('verb:être')!;
    expect(être.forms).toEqual({ je: 'suis', tu: 'es', il: 'est', nous: 'sommes', vous: 'êtes', ils: 'sont' });
    const prendre = verbById.get('verb:prendre')!;
    expect(prendre.forms.vous).toBe('prenez');
    expect(prendre.forms.nous).toBe('prenons');
    const manger = verbById.get('verb:manger')!;
    expect(manger.forms.nous).toBe('mangeons');
    const commencer = verbById.get('verb:commencer')!;
    expect(commencer.forms.nous).toBe('commençons');
    const lever = verbById.get('verb:se lever')!;
    expect(lever.forms.je).toBe('lève');
  });
});

describe('vocabulary metadata', () => {
  it('keeps gender separate from surface article (l’école is feminine)', () => {
    const ecole = vocabById.get('noun:école')!;
    expect(ecole).toBeDefined();
    expect(ecole.gender).toBe('f');
    expect(ecole.elision).toBe(true);
    expect(ecole.articles.definiteSingular).toBe("l'");
    expect(ecole.articles.indefiniteSingular).toBe('une');
    expect(withDefiniteArticle(ecole.french, { gender: ecole.gender, elision: ecole.elision })).toBe("l'école");
  });

  it('uses le/la correctly for consonant-initial nouns', () => {
    const maison = vocabById.get('noun:maison')!;
    expect(maison.articles.definiteSingular).toBe('la');
    expect(maison.articles.indefiniteSingular).toBe('une');
    const jardin = vocabById.get('noun:jardin')!;
    expect(jardin.articles.definiteSingular).toBe('le');
  });

  it('handles mute-h words explicitly', () => {
    const hopital = vocabById.get('noun:hôpital')!;
    expect(hopital.elision).toBe(true);
    const herbe = vocabById.get('noun:herbe')!;
    expect(herbe.elision).toBe(true);
  });

  it('has unique lemmas and ids', () => {
    const lemmas = vocabulary.map((v) => v.french.toLowerCase());
    expect(new Set(lemmas).size).toBe(lemmas.length);
    const ids = vocabulary.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every item has translations, plural, example, topic and level', () => {
    for (const item of vocabulary) {
      expect(item.english.length, item.id).toBeGreaterThan(0);
      expect(item.plural.length, item.id).toBeGreaterThan(0);
      expect(item.exampleFr.length, item.id).toBeGreaterThan(0);
      expect(item.exampleEn.length, item.id).toBeGreaterThan(0);
      expect(item.topic, item.id).toBeTruthy();
      expect(['A1', 'A2', 'B1']).toContain(item.level);
    }
  });

  it('covers all topics', () => {
    const topics = new Set(vocabulary.map((v) => v.topic));
    expect(topics.size).toBeGreaterThanOrEqual(12);
  });

  it('includes regular and overridden plurals', () => {
    expect(vocabById.get('noun:maison')!.plural).toBe('maisons');
    expect(vocabById.get('noun:cheval')!.plural).toBe('chevaux');
    expect(vocabById.get('noun:œil')!.plural).toBe('yeux');
    expect(vocabById.get('noun:journal')!.plural).toBe('journaux');
    expect(vocabById.get('noun:salle de bains')!.plural).toBe('salles de bains');
  });
});

describe('sentences', () => {
  it('each pair has curated alternatives without duplicating the expected answer', () => {
    for (const s of sentences) {
      expect(s.fr).not.toBe(s.en);
      expect(s.alternatives).not.toContain(s.fr);
      expect(s.note.length).toBeGreaterThan(0);
    }
  });

  it('exposes the content source shape for the exercise engine', () => {
    expect(sources.vocabulary.length).toBe(vocabulary.length);
    expect(sources.verbs.length).toBe(verbs.length);
    expect(sources.sentences.length).toBe(sentences.length);
  });

  it('labelForContentId renders human labels', () => {
    expect(labelForContentId('noun:maison')).toContain('maison');
    expect(labelForContentId('verb:être')).toContain('être');
    expect(labelForContentId('unknown:x')).toBe('unknown:x');
  });
});

describe('validation catches bad data', () => {
  it('flags duplicate lemmas, bad gender, missing translations and bad forms', () => {
    const report = validateDataset(
      {
        vocabulary: [],
        verbs: [],
        sentences: [],
      },
      [
        {
          french: 'maison',
          english: [],
          gender: 'x' as never,
          topic: 'home',
          level: 'A1',
          exampleFr: '',
          exampleEn: '',
        },
        {
          french: 'haricot',
          english: ['bean'],
          gender: 'm',
          topic: 'food',
          level: 'A2',
          exampleFr: 'Le haricot est vert.',
          exampleEn: 'The bean is green.',
          // elision deliberately missing for h-initial word
        },
      ],
      [
        {
          infinitive: 'parler',
          english: 'to speak',
          group: 'er',
          forms: { je: 'parle', tu: '', il: 'parle', nous: 'parlons', vous: 'parlez', ils: 'parlent' },
          exampleFr: 'Je parle.',
          exampleEn: 'I speak.',
          fillComplement: 'français',
        },
      ],
    );
    expect(report.errors.some((e) => e.includes('missing english'))).toBe(true);
    expect(report.errors.some((e) => e.includes('gender must be'))).toBe(true);
    expect(report.errors.some((e) => e.includes('elision explicitly'))).toBe(true);
    expect(report.errors.some((e) => e.includes('missing form for tu'))).toBe(true);
    expect(rawVocabulary.length).toBeGreaterThan(0);
    expect(rawVerbs.length).toBeGreaterThan(0);
  });
});
