/**
 * Today — the daily home screen: greeting, due reviews, daily challenges,
 * goal progress, and the primary call to action. Finite and calm by design:
 * everything here points at a short, finishable session.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ChallengeProgress, ReviewState, SessionCompletionRecord } from '@french-daily/learning-core';
import { computeLearningMetrics, todayLocal, shortDateLabel } from '@french-daily/learning-core';
import { useApp } from '../hooks/useApp';
import { Badge, Button, Card, ProgressBar, SectionTitle, Screen, Stat } from '../components/ui';
import { ProgressRing } from '../components/Charts';
import { listAttempts, listSessions, getReviewStates, getTodaysChallenges, checkMilestones } from '../storage/repos';
import { SwipeDeck } from '../components/SwipeDeck';

export function TodayScreen() {
  const { settings, startDailySession, navigate, toast } = useApp();
  const [challenges, setChallenges] = useState<ChallengeProgress[]>([]);
  const [reviews, setReviews] = useState<Map<string, ReviewState>>(new Map());
  const [sessions, setSessions] = useState<SessionCompletionRecord[]>([]);
  const [goalMinutes, setGoalMinutes] = useState(0);
  const [newMilestones, setNewMilestones] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, r, s, attempts] = await Promise.all([
        getTodaysChallenges(),
        getReviewStates(),
        listSessions(),
        listAttempts(),
      ]);
      if (!alive) return;
      setChallenges(c);
      setReviews(r);
      setSessions(s);
      const today = todayLocal();
      const ms = s.filter((x) => x.date === today).reduce((sum, x) => sum + (x.durationMs ?? 0), 0);
      setGoalMinutes(Math.round(ms / 60_000));

      // Milestone check on load (cheap; learning outcomes only).
      const learning = computeLearningMetrics(attempts, r, today);
      const ms2 = await checkMilestones({
        masteredVocab: learning.masteredItems,
        masteredVerbs: learning.masteredItems,
        reviewsTotal: attempts.length,
        streakDays: settings?.streak ?? 0,
        bestDailyAccuracy: learning.accuracy,
        recoveredCards: learning.recoveredCards,
      });
      if (alive && ms2.length > 0) {
        setNewMilestones(ms2.map((m) => m.label));
        for (const m of ms2) toast(`🎉 ${m.label}`, 'success');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dueCount = useMemo(() => {
    const today = todayLocal();
    let n = 0;
    for (const r of reviews.values()) if (r.nextDue <= today) n += 1;
    return n;
  }, [reviews]);

  const goalPct = settings ? Math.min(100, Math.round((goalMinutes / Math.max(1, settings.dailyGoalMinutes)) * 100)) : 0;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Night owl session' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Screen>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em]">{shortDateLabel(todayLocal())}</div>
          <h1 className="mt-1 text-[28px] font-bold tracking-[-0.02em] text-ink">{greeting} 👋</h1>
          <p className="mt-1 text-[15px] text-muted">A short French session is ready when you are.</p>
        </div>
        {settings?.streaksEnabled && (settings.streak ?? 0) > 0 && (
          <div className="text-right">
            <div className="text-[26px] font-bold text-ink tabular-nums">🔥 {settings.streak}</div>
            <div className="text-[11px] text-muted font-semibold">day streak</div>
          </div>
        )}
      </div>

      {/* Primary action */}
      <Card className="mt-5 p-5">
        <div className="flex items-center gap-4">
          <ProgressRing value={goalMinutes} max={settings?.dailyGoalMinutes ?? 10} size={64} stroke={6}>
            {goalPct}%
          </ProgressRing>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-ink">
              {goalMinutes >= (settings?.dailyGoalMinutes ?? 10)
                ? 'Daily goal reached — nicely done.'
                : `${Math.max(1, (settings?.dailyGoalMinutes ?? 10) - goalMinutes)} min to your daily goal`}
            </div>
            <div className="text-[13px] text-muted mt-0.5">
              {dueCount > 0 ? `${dueCount} review${dueCount === 1 ? '' : 's'} due today` : 'Reviews are all caught up'} · 5 nouns + 5 verbs + 5 sentences
            </div>
          </div>
        </div>
        <Button className="mt-4 w-full" onClick={startDailySession}>
          Start daily practice →
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => navigate('review')}>
            Review due cards ({dueCount})
          </Button>
          <Button variant="secondary" onClick={() => navigate('practice')}>
            Quick swipe drill
          </Button>
        </div>
      </Card>

      {/* Daily challenges */}
      <div className="mt-7">
        <SectionTitle
          action={
            <Badge tone="accent">
              {challenges.filter((c) => c.completed).length}/{challenges.length} done
            </Badge>
          }
        >
          Today&apos;s challenges
        </SectionTitle>
        <div className="space-y-2.5">
          {challenges.map((c) => (
            <Card key={c.id} className={`p-4 ${c.completed ? 'border-good/40' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    {c.completed ? '✅' : '🎯'} {c.def.title}
                  </div>
                  <div className="text-[12.5px] text-muted mt-0.5">{c.def.description}</div>
                  <div className="text-[10.5px] text-muted/80 mt-1 italic">based on: {c.def.derivedFrom}</div>
                </div>
                <div className="text-[13px] font-bold text-ink tabular-nums shrink-0">
                  {Math.min(c.progress, c.def.target)}/{c.def.target}
                </div>
              </div>
              <div className="mt-2.5">
                <ProgressBar value={c.progress} max={c.def.target} tone={c.completed ? 'good' : 'accent'} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Learning snapshot */}
      <div className="mt-7">
        <SectionTitle>Learning snapshot</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Due today" value={dueCount} sub="FSRS-scheduled" tone={dueCount > 0 ? 'accent' : 'good'} />
          <Stat label="Sessions today" value={sessions.filter((s) => s.date === todayLocal()).length} sub="completed only" />
        </div>
      </div>

      {/* Quick swipe */}
      <div className="mt-7">
        <SectionTitle>Quick recall drill</SectionTitle>
        <p className="text-[13px] text-muted mb-3">
          Reveal, then swipe honestly: right if you recalled it, left if you didn&apos;t. Every swipe updates your FSRS schedule and can be undone.
        </p>
        <SwipeDeck />
      </div>

      {newMilestones.length > 0 && (
        <Card className="mt-6 p-4 border-good/40">
          <div className="text-[15px] font-semibold text-good">New milestones 🎉</div>
          <ul className="mt-1 text-[14px] text-ink">
            {newMilestones.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        </Card>
      )}
    </Screen>
  );
}
