/**
 * Nouns — browse the curated vocabulary with articles, gender, plurals and
 * examples. Filter by topic/level; start a focused practice from here.
 */
import { useMemo, useState } from 'react';
import { sources, vocabulary } from '@french-daily/french-data';
import { customSessionConfig, withDefiniteArticle, type Topic, type VocabItem } from '@french-daily/learning-core';
import { Badge, Card, Chip, Screen, SectionTitle, Button } from '../components/ui';
import { speakFrench } from '../services/feedback';
import { useApp } from '../hooks/useApp';

const TOPICS: Array<Topic | 'all'> = ['all', ...Array.from(new Set(vocabulary.map((v) => v.topic))).sort()];
const LEVELS = ['all', 'A1', 'A2', 'B1'] as const;

export function NounsScreen() {
  const { startSession, settings } = useApp();
  const [topic, setTopic] = useState<Topic | 'all'>('all');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      vocabulary.filter(
        (v) => (topic === 'all' || v.topic === topic) && (level === 'all' || v.level === level),
      ),
    [topic, level],
  );

  return (
    <Screen>
      <SectionTitle level={1}
        action={
          <Button
            variant="secondary"
            className="!py-2 text-[13px]"
            onClick={() =>
              startSession(
                customSessionConfig({
                  mode: 'custom',
                  topics: topic === 'all' ? 'all' : [topic],
                  levels: level === 'all' ? 'all' : [level],
                  kinds: ['gender-select', 'translation-typed'],
                  nouns: 6,
                  verbs: 0,
                  sentences: 0,
                }),
              )
            }
          >
            Practice these →
          </Button>
        }
      >
        Nouns · {filtered.length} words
      </SectionTitle>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {TOPICS.map((t) => (
          <Chip key={t} active={topic === t} onClick={() => setTopic(t)}>
            {t === 'all' ? 'All topics' : t}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {LEVELS.map((l) => (
          <Chip key={l} active={level === l} onClick={() => setLevel(l)}>
            {l === 'all' ? 'All levels' : l}
          </Chip>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {filtered.map((item) => (
          <VocabRow
            key={item.id}
            item={item}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onSpeak={(t) => speakFrench(t, settings?.pronunciationEnabled ?? false)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-muted text-[14px] py-10">No words match these filters.</div>
        )}
      </div>

      <div className="mt-6 text-[12px] text-muted">
        {sources.vocabulary.length} words total · gender and elision metadata validated at build time · examples are curated, not machine-generated.
      </div>
    </Screen>
  );
}

function VocabRow({
  item,
  expanded,
  onToggle,
  onSpeak,
}: {
  item: VocabItem;
  expanded: boolean;
  onToggle: () => void;
  onSpeak: (t: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-semibold text-ink">{item.french}</span>
            <Badge tone={item.gender === 'f' ? 'accent' : 'neutral'}>{item.gender}</Badge>
            {item.elision && <Badge tone="warn">élision</Badge>}
          </div>
          <div className="text-[13.5px] text-muted mt-0.5">{item.english.join(' · ')}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge>{item.level}</Badge>
          <span className={`text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 anim-slide-up">
          <div className="rounded-xl bg-surface2 p-3 text-[14px] space-y-1">
            <div>
              <span className="text-muted">definite: </span>
              <strong>{item.number === 'plural' ? `les ${item.french}` : withDefiniteArticle(item.french, { gender: item.gender, elision: item.elision })}</strong>
              <span className="text-muted"> · plural: </span>
              <strong>{item.articles.definitePlural} {item.plural}</strong>
            </div>
            <div>
              <span className="text-muted">indefinite: </span>
              <strong>{item.number === 'plural' ? 'des' : item.articles.indefiniteSingular} {item.french}</strong>
            </div>
          </div>
          <div className="mt-2.5 text-[14px]">
            <div className="text-ink italic">{item.exampleFr}</div>
            <div className="text-muted text-[13px]">{item.exampleEn}</div>
          </div>
          <Button variant="ghost" className="mt-2 !py-1.5 text-[13px]" onClick={() => onSpeak(item.french)}>
            🔊 Pronounce
          </Button>
        </div>
      )}
    </Card>
  );
}
