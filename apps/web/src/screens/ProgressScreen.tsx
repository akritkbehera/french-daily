/**
 * Progress — the dashboard, with learning metrics and engagement metrics
 * kept strictly separate. Definitions are shown inline so "learned" and
 * "mastered" are unambiguous.
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  accuracyOverTime,
  computeEngagementMetrics,
  computeLearningMetrics,
  difficultItems,
  todayLocal,
  weeklyActivity,
} from '@french-daily/learning-core';
import { labelForContentId } from '@french-daily/french-data';
import { Badge, Card, Screen, SectionTitle, Stat } from '../components/ui';
import { BarSeries, LineSeries } from '../components/Charts';
import { listAttempts, listSessions, getReviewStates, listAllChallenges, listMilestones } from '../storage/repos';
import { useApp } from '../hooks/useApp';

export function ProgressScreen() {
  const { settings } = useApp();
  const [attempts, sessions, reviews, challenges, milestones] = useLiveQuery(
    () => Promise.all([listAttempts(), listSessions(), getReviewStates(), listAllChallenges(), listMilestones()]),
    [], [[], [], new Map(), [], []],
  );

  const today = todayLocal();
  const learning = useMemo(() => computeLearningMetrics(attempts, reviews, today), [attempts, reviews, today]);
  const engagement = useMemo(
    () => computeEngagementMetrics(attempts, sessions, challenges, settings?.streak ?? 0, settings?.longestStreak ?? 0, today),
    [attempts, sessions, challenges, settings, today],
  );
  const accuracySeries = useMemo(() => accuracyOverTime(attempts, 14, today), [attempts, today]);
  const activity = useMemo(() => weeklyActivity(attempts, sessions, today), [attempts, sessions, today]);
  const difficult = useMemo(() => difficultItems(attempts, reviews, labelForContentId, 5), [attempts, reviews]);

  return (
    <Screen>
      <SectionTitle level={1}>Progress</SectionTitle>

      {/* LEARNING metrics */}
      <div className="rounded-2xl border border-accent/30 bg-accentsoft/40 p-1.5 pl-3 mb-2 text-[11px] font-bold text-accent uppercase tracking-[0.1em]">
        Learning quality
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Accuracy" value={`${learning.accuracy}%`} sub={`${learning.totalAttempts} answer${learning.totalAttempts === 1 ? '' : 's'}`} tone={learning.accuracy >= 80 ? 'good' : 'accent'} />
        <Stat
          label="Est. retention"
          value={learning.estimatedRetention !== null ? `${Math.round(learning.estimatedRetention * 100)}%` : '—'}
          sub="FSRS retrievability now"
        />
        <Stat label="Learned cards" value={learning.learnedItems} sub="≥2 correct on 2 days" tone="good" />
        <Stat label="Mastered cards" value={learning.masteredItems} sub="≥4 correct, 3 days, ivl ≥7d" tone="accent" />
        <Stat label="Recovered" value={`${learning.recoveredCards}`} sub={`${learning.recoveryRate}% of failed items`} />
        <Stat
          label="Avg time"
          value={learning.avgSecondsPerExercise !== null ? `${learning.avgSecondsPerExercise}s` : '—'}
          sub="per exercise"
        />
      </div>

      <Card className="mt-3 p-4">
        <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Accuracy, last 14 days</div>
        <LineSeries data={accuracySeries.map((d) => ({ date: d.date, value: d.accuracy }))} label="Accuracy over time" />
        <div className="mt-3 text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Review backlog</div>
        <div className="flex gap-3 text-[14px] text-ink">
          <span>
            <strong>{learning.dueToday}</strong> <span className="text-muted">due</span>
          </span>
          <span>
            <strong className={learning.overdue > 0 ? 'text-bad' : ''}>{learning.overdue}</strong>{' '}
            <span className="text-muted">overdue</span>
          </span>
          <span>
            <strong>{learning.meanDifficulty !== null ? Math.round(learning.meanDifficulty * 100) : 0}%</strong>{' '}
            <span className="text-muted">mean difficulty</span>
          </span>
        </div>
      </Card>

      {/* Hard items */}
      {difficult.length > 0 && (
        <Card className="mt-3 p-4">
          <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em]">Difficult right now</div>
          <ul className="mt-2 space-y-1.5">
            {difficult.map((d) => (
              <li key={d.itemId} className="flex items-center justify-between text-[14px]">
                <span className="text-ink truncate">{d.label}</span>
                <Badge tone="bad">{d.failures} miss{d.failures === 1 ? '' : 'es'}</Badge>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[12px] text-muted">
            These appear first in reviews and in the &quot;fix missed answers&quot; challenge.
          </div>
        </Card>
      )}

      {/* ENGAGEMENT metrics */}
      <div className="mt-7 rounded-2xl border border-edge bg-surface2/60 p-1.5 pl-3 mb-2 text-[11px] font-bold text-muted uppercase tracking-[0.1em]">
        Engagement (habit — not proficiency)
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sessions today" value={engagement.sessionsToday} sub={`${engagement.sessionsTotal} total`} />
        <Stat label="Minutes today" value={engagement.minutesToday} sub={`goal ${settings?.dailyGoalMinutes ?? 10} min`} />
        <Stat
          label="Streak"
          value={settings?.streaksEnabled ? `${engagement.streakDays}d` : 'off'}
          sub={`best ${engagement.longestStreak}d`}
        />
        <Stat label="Exercises today" value={engagement.exercisesToday} sub="attempts recorded" />
      </div>

      <Card className="mt-3 p-4">
        <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em] mb-2">Activity this week</div>
        <BarSeries data={activity.map((d) => ({ date: d.date, value: d.exercises }))} label="Weekly activity" />
        <div className="mt-2 flex gap-4 text-[12px] text-muted">
          <span>🔥 {activity.filter((d) => d.exercises > 0).length} active days</span>
          <span>⚡ {activity.reduce((s, d) => s + d.sessions, 0)} sessions</span>
          <span>📝 {activity.reduce((s, d) => s + d.exercises, 0)} exercises</span>
        </div>
      </Card>

      {/* Milestones */}
      <div className="mt-7">
        <SectionTitle>Milestones</SectionTitle>
        {milestones.length === 0 ? (
          <Card className="p-6 text-center text-[14px] text-muted">
            Milestones celebrate real learning outcomes — mastery counts, recoveries, consistency. They&apos;ll appear here as you progress.
          </Card>
        ) : (
          <div className="space-y-2">
            {milestones.slice(0, 12).map((m, i) => (
              <Card key={`${m.kind}-${m.value}-${i}`} className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[15px] font-semibold text-ink">🏆 {m.label}</div>
                  <div className="text-[12px] text-muted">{m.date}</div>
                </div>
                <Badge tone="good">achieved</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 text-[11.5px] text-muted leading-relaxed">
        <strong>Definitions.</strong> <em>Learned</em> = at least 2 correct attempts on 2 distinct days.{' '}
        <em>Mastered</em> = at least 4 correct attempts across 3 days <strong>and</strong> an FSRS interval of 7+ days.{' '}
        <em>Estimated retention</em> is the mean FSRS retrievability of your reviewed items right now. All numbers are
        computed locally; nothing leaves your device.
      </div>
    </Screen>
  );
}
