/**
 * Practice — choose what to practice: the daily session, a quick swipe drill,
 * or a custom session by topic/kind. Finite sessions only; no endless feed.
 */
import { useState } from 'react';
import { customSessionConfig, type ExerciseKind, type SessionConfig, type Topic } from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { Badge, Button, Card, Chip, Screen, SectionTitle, Segmented } from '../components/ui';
import { useApp } from '../hooks/useApp';
import { SwipeDeck } from '../components/SwipeDeck';

const TOPICS: Topic[] = Array.from(new Set(sources.vocabulary.map((v) => v.topic))).sort();
const KINDS: Array<{ value: ExerciseKind; label: string }> = [
  { value: 'translation-typed', label: 'Typed translation' },
  { value: 'multiple-choice', label: 'Multiple choice' },
  { value: 'conjugation-fill', label: 'Fill the verb' },
  { value: 'conjugation-direct', label: 'Conjugate' },
  { value: 'word-order', label: 'Word order' },
  { value: 'sentence-construction', label: 'Build sentences' },
  { value: 'gender-select', label: 'Gender' },
];

export function PracticeScreen() {
  const { startDailySession, startSession, settings } = useApp();
  const [size, setSize] = useState<'short' | 'standard' | 'long'>(settings?.sessionSize ?? 'standard');
  const [mode, setMode] = useState<'daily' | 'swipe' | 'custom'>('daily');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [kinds, setKinds] = useState<ExerciseKind[]>([]);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const startCustom = () => {
    const config: SessionConfig = customSessionConfig({
      mode: 'custom',
      topics: topics.length > 0 ? topics : 'all',
      kinds: kinds.length > 0 ? kinds : 'all',
      size,
    });
    startSession(config);
  };

  return (
    <Screen>
      <SectionTitle>Practice</SectionTitle>
      <p className="text-[14px] text-muted -mt-1 mb-4">
        Sessions are short and finite — you&apos;ll always reach a satisfying finish line.
      </p>

      <Segmented
        label="Practice mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'daily', label: 'Daily session' },
          { value: 'swipe', label: 'Swipe drill' },
          { value: 'custom', label: 'Custom' },
        ]}
      />

      {mode === 'daily' && (
        <Card className="mt-4 p-5">
          <h3 className="text-[17px] font-bold text-ink">Daily practice</h3>
          <p className="mt-1 text-[13.5px] text-muted">
            5 nouns + 5 verbs + 5 sentences, prioritized by your FSRS review schedule. Failed items come back as in-session retries (max 2) so nothing slips through.
          </p>
          <div className="mt-3">
            <Segmented
              label="Session size"
              value={size}
              onChange={setSize}
              options={[
                { value: 'short', label: 'Short (9)' },
                { value: 'standard', label: 'Standard (15)' },
                { value: 'long', label: 'Long (24)' },
              ]}
            />
          </div>
          <Button
            className="mt-4 w-full"
            onClick={() => {
              startSession(customSessionConfig({ mode: 'daily', size }));
            }}
          >
            Start session →
          </Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={startDailySession}>
            Use my default size
          </Button>
        </Card>
      )}

      {mode === 'swipe' && (
        <div className="mt-4">
          <SwipeDeck />
        </div>
      )}

      {mode === 'custom' && (
        <Card className="mt-4 p-5">
          <h3 className="text-[17px] font-bold text-ink">Custom session</h3>

          <div className="mt-3">
            <div className="text-[12px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Topics</div>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <Chip key={t} active={topics.includes(t)} onClick={() => toggle(topics, t, setTopics)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-[12px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Exercise kinds</div>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <Chip key={k.value} active={kinds.includes(k.value)} onClick={() => toggle(kinds, k.value, setKinds)}>
                  {k.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <Segmented
              label="Session size"
              value={size}
              onChange={setSize}
              options={[
                { value: 'short', label: 'Short' },
                { value: 'standard', label: 'Standard' },
                { value: 'long', label: 'Long' },
              ]}
            />
          </div>

          <Button className="mt-4 w-full" onClick={startCustom}>
            Build my session →
          </Button>
          {(topics.length > 0 || kinds.length > 0) && (
            <div className="mt-2">
              <Badge tone="accent">
                {topics.length > 0 ? `${topics.length} topics` : 'all topics'} ·{' '}
                {kinds.length > 0 ? `${kinds.length} kinds` : 'all kinds'}
              </Badge>
            </div>
          )}
        </Card>
      )}
    </Screen>
  );
}
