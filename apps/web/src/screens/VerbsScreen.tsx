/**
 * Verbs — conjugation tables with search and group filters.
 */
import { useMemo, useState } from 'react';
import { verbs } from '@french-daily/french-data';
import { conjugated, customSessionConfig, PRONOUNS, type PronounKey, type Verb } from '@french-daily/learning-core';
import { Badge, Button, Card, Chip, Screen, SectionTitle } from '../components/ui';
import { speakFrench } from '../services/feedback';
import { useApp } from '../hooks/useApp';

const GROUPS = ['all', 'er', 'ir', 're', 'irregular'] as const;

export function VerbsScreen() {
  const { startSession, settings } = useApp();
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      verbs.filter(
        (v) =>
          (group === 'all' || v.group === group) &&
          (query.trim() === '' ||
            v.infinitive.includes(query.toLowerCase()) ||
            v.english.toLowerCase().includes(query.toLowerCase())),
      ),
    [group, query],
  );

  return (
    <Screen>
      <SectionTitle
        action={
          <Button
            variant="secondary"
            className="!py-2 text-[13px]"
            onClick={() =>
              startSession(
                customSessionConfig({
                  mode: 'custom',
                  kinds: ['conjugation-fill', 'conjugation-direct'],
                  nouns: 0,
                  verbs: 6,
                  sentences: 0,
                }),
              )
            }
          >
            Practice these →
          </Button>
        }
      >
        Verbs · {filtered.length} verbs
      </SectionTitle>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search verbs (French or English)…"
        aria-label="Search verbs"
        className="w-full rounded-xl border border-edge bg-surface px-4 py-2.5 text-[15px] text-ink placeholder:text-muted/60"
      />

      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {GROUPS.map((g) => (
          <Chip key={g} active={group === g} onClick={() => setGroup(g)}>
            {g === 'all' ? 'All groups' : g === 'irregular' ? 'Irregular' : `-${g} verbs`}
          </Chip>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {filtered.map((verb) => (
          <VerbRow
            key={verb.id}
            verb={verb}
            expanded={expanded === verb.id}
            onToggle={() => setExpanded(expanded === verb.id ? null : verb.id)}
            onSpeak={(t) => speakFrench(t, settings?.pronunciationEnabled ?? false)}
          />
        ))}
        {filtered.length === 0 && <div className="text-center text-muted text-[14px] py-10">No verbs match.</div>}
      </div>
    </Screen>
  );
}

function VerbRow({
  verb,
  expanded,
  onToggle,
  onSpeak,
}: {
  verb: Verb;
  expanded: boolean;
  onToggle: () => void;
  onSpeak: (t: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-semibold text-ink">{verb.infinitive}</span>
            {verb.reflexive && <Badge tone="accent">reflexive</Badge>}
            <Badge tone={verb.group === 'irregular' ? 'warn' : 'neutral'}>
              {verb.group === 'irregular' ? 'irregular' : `-${verb.group}`}
            </Badge>
          </div>
          <div className="text-[13.5px] text-muted mt-0.5">{verb.english}</div>
        </div>
        <span className={`text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 anim-slide-up">
          <div className="rounded-xl overflow-hidden border border-edge">
            <table className="w-full text-[14px]">
              <tbody>
                {PRONOUNS.map((p, i) => {
                  const key = p as PronounKey;
                  return (
                    <tr key={p} className={i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}>
                      <td className="px-3 py-1.5 text-muted font-medium w-20">{p}</td>
                      <td className="px-3 py-1.5 text-ink font-semibold">
                        <button className="hover:text-accent text-left" onClick={() => onSpeak(verb.forms[key])}>
                          {verb.forms[key]}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-[12.5px] text-muted hidden sm:table-cell">{conjugated(key, verb.forms[key], verb.reflexive)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2.5 text-[14px]">
            <div className="text-ink italic">{verb.exampleFr}</div>
            <div className="text-muted text-[13px]">{verb.exampleEn}</div>
          </div>
          <Button variant="ghost" className="mt-2 !py-1.5 text-[13px]" onClick={() => onSpeak(verb.exampleFr)}>
            🔊 Hear the example
          </Button>
        </div>
      )}
    </Card>
  );
}
