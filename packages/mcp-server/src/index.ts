#!/usr/bin/env node
/**
 * French Daily MCP server — exposes the learning engine to MCP clients
 * (e.g. OpenCode) over stdio.
 *
 * The server is read/compute oriented and deterministic: content lookup,
 * exercise generation, answer grading (including accent/typo/article
 * distinctions), FSRS review scheduling, and local progress statistics.
 * It never talks to the network and never mutates the web app's IndexedDB;
 * optional progress statistics are read from a JSON file you point it at.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import {
  conjugationExplanation,
  conjugated,
  computeEngagementMetrics,
  computeLearningMetrics,
  DEFAULT_DESIRED_RETENTION,
  fsrsReview,
  fsrsInterval,
  generateSentenceExercise,
  generateVerbExercise,
  generateVocabExercise,
  gradeAnswerList,
  PRONOUNS,
  rngFromSeed,
  type AttemptRecord,
  type ChallengeProgress,
  type Exercise,
  type ExerciseKind,
  type FilterOptions,
  type FsrsRating,
  type Level,
  type PronounKey,
  type ReviewState,
  type SessionCompletionRecord,
  type Topic,
} from '@french-daily/learning-core';
import {
  sentences,
  verbs,
  vocabulary,
} from '@french-daily/french-data';

const VERSION = '1.0.0';

function text(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorText(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

const server = new McpServer({ name: 'french-daily', version: VERSION });

/* ------------------------------------------------------------------ */
/* 1. lookup_word                                                      */
/* ------------------------------------------------------------------ */

server.registerTool(
  'lookup_word',
  {
    title: 'Look up a French noun',
    description:
      'Find French vocabulary entries by French lemma or English translation. Returns gender, articles, elision, plural, level, topic and a curated example sentence.',
    inputSchema: {
      query: z.string().min(1).describe('French lemma (e.g. "maison") or English meaning (e.g. "house")'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum results (default 5)'),
    },
  },
  async ({ query, limit }) => {
    const q = query.toLowerCase().trim();
    const hits = vocabulary
      .filter(
        (v) =>
          v.french.toLowerCase().includes(q) ||
          v.english.some((e) => e.toLowerCase().includes(q)),
      )
      .slice(0, limit ?? 5);
    if (hits.length === 0) return errorText(`no vocabulary matches "${query}"`);
    return text(
      hits.map((v) => ({
        id: v.id,
        french: v.french,
        english: v.english,
        gender: v.gender,
        definiteArticle: v.articles.definiteSingular,
        indefiniteArticle: v.articles.indefiniteSingular,
        elision: v.elision,
        plural: v.plural,
        definitePlural: `${v.articles.definitePlural} ${v.plural}`,
        level: v.level,
        topic: v.topic,
        exampleFr: v.exampleFr,
        exampleEn: v.exampleEn,
      })),
    );
  },
);

/* ------------------------------------------------------------------ */
/* 2. lookup_verb                                                      */
/* ------------------------------------------------------------------ */

server.registerTool(
  'lookup_verb',
  {
    title: 'Look up a verb conjugation table',
    description:
      'Full present-indicative conjugation table for a French verb (search by infinitive or English meaning), including group, reflexivity and an example sentence.',
    inputSchema: {
      query: z.string().min(1).describe('Infinitive (e.g. "être", "se lever") or English meaning'),
      limit: z.number().int().min(1).max(10).optional().describe('Maximum results (default 3)'),
    },
  },
  async ({ query, limit }) => {
    const q = query.toLowerCase().trim();
    const hits = verbs
      .filter((v) => v.infinitive.toLowerCase().includes(q) || v.english.toLowerCase().includes(q))
      .slice(0, limit ?? 3);
    if (hits.length === 0) return errorText(`no verb matches "${query}"`);
    return text(
      hits.map((v) => ({
        id: v.id,
        infinitive: v.infinitive,
        english: v.english,
        group: v.group,
        reflexive: v.reflexive,
        present: Object.fromEntries(PRONOUNS.map((p) => [p, conjugated(p as PronounKey, v.forms[p as PronounKey], v.reflexive)])),
        exampleFr: v.exampleFr,
        exampleEn: v.exampleEn,
      })),
    );
  },
);

/* ------------------------------------------------------------------ */
/* 3. conjugate                                                        */
/* ------------------------------------------------------------------ */

server.registerTool(
  'conjugate',
  {
    title: 'Conjugate a verb with explanation',
    description:
      'Conjugate a French verb in the present indicative for one pronoun (or all six), with elision handled and a grammar explanation of the form.',
    inputSchema: {
      infinitive: z.string().min(1).describe('Verb infinitive, e.g. "prendre" or "se laver"'),
      pronoun: z
        .enum(['je', 'tu', 'il', 'nous', 'vous', 'ils'])
        .optional()
        .describe('Pronoun to conjugate for; omit for the full table'),
    },
  },
  async ({ infinitive, pronoun }) => {
    const q = infinitive.toLowerCase().trim();
    const verb = verbs.find((v) => v.infinitive.toLowerCase() === q) ??
      verbs.find((v) => v.infinitive.toLowerCase().includes(q));
    if (!verb) return errorText(`unknown verb "${infinitive}"`);
    if (pronoun) {
      const form = verb.forms[pronoun as PronounKey];
      return text({
        infinitive: verb.infinitive,
        pronoun,
        form,
        display: conjugated(pronoun as PronounKey, form, verb.reflexive),
        explanation: conjugationExplanation(verb.infinitive, verb.group, pronoun as PronounKey, form),
      });
    }
    return text({
      infinitive: verb.infinitive,
      english: verb.english,
      group: verb.group,
      present: verb.forms,
    });
  },
);

/* ------------------------------------------------------------------ */
/* 4. generate_exercise                                                */
/* ------------------------------------------------------------------ */

const EXERCISE_KINDS = [
  'translation-typed',
  'multiple-choice',
  'conjugation-fill',
  'conjugation-direct',
  'word-order',
  'sentence-construction',
  'gender-select',
] as const;

server.registerTool(
  'generate_exercise',
  {
    title: 'Generate a practice exercise',
    description:
      'Generate one deterministic French exercise (vocab, verb or sentence). Set includeAnswer=false to quiz a learner without leaking the answer; grading stays deterministic via grade_answer.',
    inputSchema: {
      kind: z.enum(EXERCISE_KINDS).optional().describe('Restrict to one exercise kind'),
      topic: z.string().optional().describe('Restrict by topic, e.g. "food", "travel"'),
      level: z.enum(['A1', 'A2', 'B1']).optional().describe('Restrict by CEFR level'),
      section: z.enum(['nouns', 'verbs', 'sentences']).optional().describe('Content section'),
      seed: z.string().optional().describe('Seed for deterministic generation'),
      includeAnswer: z.boolean().optional().describe('Include the expected answer (default true)'),
    },
  },
  async ({ kind, topic, level, section, seed, includeAnswer }) => {
    const rng = rngFromSeed(seed ?? `mcp-${Date.now()}`);
    const filter: FilterOptions = {
      topics: topic ? ([topic] as Topic[]) : 'all',
      levels: level ? ([level] as Level[]) : 'all',
      kinds: kind ? [kind as ExerciseKind] : 'all',
    };
    const pool = section ?? 'nouns';
    let exercise: Exercise | null = null;

    for (let attempt = 0; attempt < 25 && !exercise; attempt++) {
      if (pool === 'nouns') {
        const item = vocabulary[Math.floor(rng() * vocabulary.length)];
        exercise = generateVocabExercise(item, vocabulary, rng, filter);
      } else if (pool === 'verbs') {
        const verb = verbs[Math.floor(rng() * verbs.length)];
        exercise = generateVerbExercise(verb, verb.fillComplement, rng, filter);
      } else {
        const pair = sentences[Math.floor(rng() * sentences.length)];
        exercise = generateSentenceExercise(pair, rng, filter);
      }
    }
    if (!exercise) return errorText('no exercise matches those filters');
    const { expected: _expected, accepted: _accepted, explanation: _explanation, ...publicExercise } = exercise;
    const quiz = Object.fromEntries(Object.entries(publicExercise).filter(([key]) => !['correctIndex', 'correctOrder', 'hint'].includes(key)));
    return text(
      includeAnswer === false
        ? quiz
        : { ...exercise },
    );
  },
);

/* ------------------------------------------------------------------ */
/* 5. grade_answer                                                     */
/* ------------------------------------------------------------------ */

server.registerTool(
  'grade_answer',
  {
    title: 'Grade a typed French answer',
    description:
      'Deterministically grade a learner answer against the expected answer and curated alternatives. Distinguishes correct / accent-only mistakes / missing article / small typos / wrong, and always returns an explanation.',
    inputSchema: {
      response: z.string().describe("The learner's answer"),
      expected: z.string().describe('The expected correct answer'),
      accepted: z.array(z.string()).optional().describe('Curated alternative accepted answers'),
      explanation: z.string().optional().describe('Grammar note shown when the answer is wrong'),
    },
  },
  async ({ response, expected, accepted, explanation }) => {
    const grade = gradeAnswerList(response, expected, accepted ?? [], explanation);
    return text(grade);
  },
);

/* ------------------------------------------------------------------ */
/* 6. explain_sentence                                                */
/* ------------------------------------------------------------------ */

server.registerTool(
  'explain_sentence',
  {
    title: 'Explain a sentence pair',
    description:
      'Return a curated French/English sentence pair with its grammar note and accepted translation alternatives (useful for translation feedback).',
    inputSchema: {
      query: z.string().min(1).describe('Sentence id, French text, or English text'),
    },
  },
  async ({ query }) => {
    const q = query.toLowerCase().trim();
    const hit =
      sentences.find((s) => s.id.toLowerCase() === q) ??
      sentences.find((s) => s.fr.toLowerCase().includes(q) || s.en.toLowerCase().includes(q));
    if (!hit) return errorText(`no sentence matches "${query}"`);
    return text({
      id: hit.id,
      en: hit.en,
      fr: hit.fr,
      acceptedAlternatives: hit.alternatives,
      topic: hit.topic,
      level: hit.level,
      grammarNote: hit.note,
    });
  },
);

/* ------------------------------------------------------------------ */
/* 7. schedule_review (FSRS)                                           */
/* ------------------------------------------------------------------ */

server.registerTool(
  'schedule_review',
  {
    title: 'Compute the next FSRS review',
    description:
      'Apply one FSRS-4.5 review to an item and return the new stability/difficulty and the interval in days. Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy. Omit stability/difficulty for a first review.',
    inputSchema: {
      rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).describe('FSRS rating'),
      stability: z.number().positive().optional().describe('Current stability in days (omit for first review)'),
      difficulty: z.number().min(1).max(10).optional().describe('Current difficulty 1..10'),
      elapsed: z.number().min(0).optional().describe('Days elapsed since the last review (default 0)'),
      desiredRetention: z
        .number()
        .min(0.7)
        .max(0.99)
        .optional()
        .describe('Target recall probability (default 0.9)'),
    },
  },
  async ({ rating, stability, difficulty, elapsed, desiredRetention }) => {
    const retention = desiredRetention ?? DEFAULT_DESIRED_RETENTION;
    const prev =
      stability === undefined
        ? null
        : {
            stability,
            difficulty: difficulty ?? 5,
            lastInterval: 0,
            reps: 1,
            lapses: 0,
          };
    const result = fsrsReview(prev, rating as FsrsRating, elapsed ?? 0, retention);
    return text({
      rating,
      previousState: prev,
      newState: result.state,
      intervalDays: result.interval,
      retrievabilityBeforeReview: Math.round(result.retrievability * 1000) / 1000,
      desiredRetention: retention,
      firstReviewIntervalDays: prev ? undefined : fsrsInterval(result.state.stability, retention),
    });
  },
);

/* ------------------------------------------------------------------ */
/* 8. study_stats                                                      */
/* ------------------------------------------------------------------ */

server.registerTool(
  'study_stats',
  {
    title: 'Summarize a progress file',
    description:
      'Compute learning metrics (accuracy, estimated retention, mastery, recovery) and engagement metrics (sessions, streak) from a local JSON progress file with { attempts, reviews, sessions?, challenges?, streak?, longestStreak? }.',
    inputSchema: {
      progressFile: z.string().describe('Absolute path to a JSON progress file'),
    },
  },
  async ({ progressFile }) => {
    let raw: string;
    try {
      raw = readFileSync(progressFile, 'utf8');
    } catch (e) {
      return errorText(`cannot read ${progressFile}: ${(e as Error).message}`);
    }
    let data: {
      attempts?: AttemptRecord[];
      reviews?: ReviewState[] | Array<[string, ReviewState]>;
      sessions?: SessionCompletionRecord[];
      challenges?: ChallengeProgress[];
      streak?: number;
      longestStreak?: number;
    };
    try {
      data = JSON.parse(raw);
    } catch {
      return errorText(`${progressFile} is not valid JSON`);
    }
    const attempts = data.attempts ?? [];
    const reviews = new Map<string, ReviewState>();
    if (Array.isArray(data.reviews)) {
      for (const entry of data.reviews) {
        if (Array.isArray(entry)) reviews.set(entry[0], entry[1]);
        else if (entry && typeof entry === 'object' && 'itemId' in entry) reviews.set((entry as ReviewState).itemId, entry as ReviewState);
      }
    }
    const learning = computeLearningMetrics(attempts, reviews);
    const engagement = computeEngagementMetrics(
      attempts,
      data.sessions ?? [],
      data.challenges ?? [],
      data.streak ?? 0,
      data.longestStreak ?? 0,
    );
    return text({
      source: progressFile,
      learning,
      engagement,
      note: 'Learning metrics describe recall quality; engagement metrics describe habit. Engagement is never proficiency.',
    });
  },
);

/* ------------------------------------------------------------------ */

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`french-daily MCP server v${VERSION} ready (stdio)`);
