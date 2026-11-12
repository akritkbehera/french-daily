/**
 * SessionRunner — the finite, focused practice flow.
 *
 * Builds a session from the FSRS-prioritized content pool, presents one
 * exercise at a time, records every graded attempt immediately, retries
 * failed items in-session, and finishes with an honest completion summary.
 * Partial sessions are never counted as completed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GradeResult, SessionConfig, SessionItem, SessionState, SessionSummary } from '@french-daily/learning-core';
import {
  answerSessionItem,
  buildSession,
  computeItemStats,
  countsTowardStreak,
  isMastered,
  isSessionComplete,
  summarizeSession,
  todayLocal,
} from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { ExerciseCard, feedbackEffects } from './ExerciseCard';
import { Badge, Button, Card, ProgressBar, Stat } from './ui';
import { checkMilestones, getReviewStates, listAttempts, recordAttempt, recordSessionCompletion } from '../storage/repos';
import { useApp } from '../hooks/useApp';
import { prefersReducedMotion } from '../services/feedback';

interface Props {
  config: SessionConfig;
  onClose: () => void;
  onStartAnother: () => void;
}

export function SessionRunner({ config, onClose, onStartAnother }: Props) {
  const { settings, toast } = useApp();
  const [session, setSession] = useState<SessionState | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [streak, setStreak] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const presentedAt = useRef<number>(Date.now());
  const sessionStart = useRef<number>(Date.now());
  const [abandonConfirm, setAbandonConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReviewStates().then((states) => {
      if (cancelled) return;
      setSession(buildSession(config, sources, states));
      sessionStart.current = Date.now();
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  // Live session timer (minutes toward the daily goal).
  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart.current) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);

  const items = session?.items ?? [];
  const currentItem: SessionItem | undefined = useMemo(() => items.find((i) => !i.answered) ?? items[items.length - 1], [items]);
  const answeredCount = items.filter((i) => i.answered).length;

  const handleAnswer = useCallback(
    async (response: string, selectionIndex?: number) => {
      if (!session || !currentItem || grade) return;
      const durationMs = Date.now() - presentedAt.current;
      const result = answerSessionItem(session, currentItem.exercise.id, response, selectionIndex);
      if (!result.grade) return;

      setSession(result.state);
      setGrade(result.grade);
      feedbackEffects(result.grade, {
        sound: settings?.soundEnabled ?? false,
        haptics: settings?.hapticsEnabled ?? false,
      });

      await recordAttempt({
        exercise: currentItem.exercise,
        response,
        grade: result.grade,
        sessionId: result.state.id,
        durationMs,
      });
    },
    [session, currentItem, grade, settings],
  );

  const handleContinue = useCallback(async () => {
    if (!session) return;
    setGrade(null);
    presentedAt.current = Date.now();

    if (isSessionComplete(session)) {
      const s = summarizeSession(session, 0, todayLocal());
      if (countsTowardStreak(session)) {
        const { streak: newStreak } = await recordSessionCompletion(
          s,
          session.config.mode,
          Date.now() - sessionStart.current,
        );
        setStreak(newStreak);
        s.streakDays = newStreak;
      }
      setSummary(s);

      // Milestones are learning outcomes only — never swipe counts or XP.
      try {
        const attempts = await listAttempts();
        const reviews = await getReviewStates();
        const stats = computeItemStats(attempts);
        let masteredVocab = 0;
        let masteredVerbs = 0;
        for (const [id, st] of stats) {
          if (isMastered(st, reviews.get(id))) {
            if (id.startsWith('noun:')) masteredVocab += 1;
            if (id.startsWith('verb:')) masteredVerbs += 1;
          }
        }
        const newMilestones = await checkMilestones({
          masteredVocab,
          masteredVerbs,
          reviewsTotal: attempts.length,
          streakDays: s.streakDays,
          bestDailyAccuracy: s.accuracy,
          recoveredCards: 0,
        });
        for (const m of newMilestones) {
          if (settings?.celebrationsEnabled) toast(`🎉 Milestone: ${m.label}`, 'success');
        }
      } catch {
        // Milestone checks never block session completion.
      }
    }
  }, [session, settings, toast]);

  const retryCount = items.filter((i) => i.retry).length;

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex items-center justify-center">
        <div className="text-muted text-[15px]">Preparing your session…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-5 py-5">
        {!summary && (
          <>
            {/* Session header */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => (answeredCount > 0 ? setAbandonConfirm(true) : onClose())}
                className="rounded-full border border-edge bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-muted"
                aria-label="End session"
              >
                ✕ End
              </button>
              <div className="flex-1">
                <ProgressBar value={answeredCount} max={Math.max(items.length, 1)} />
              </div>
              <div className="text-[12px] font-semibold text-muted tabular-nums w-16 text-right">
                {answeredCount}/{items.length}
              </div>
            </div>

            {retryCount > 0 && (
              <div className="mt-3">
                <Badge tone="warn">{retryCount} retry {retryCount === 1 ? 'item' : 'items'} in this session</Badge>
              </div>
            )}

            <div className="mt-6">
              {currentItem && (
                <ExerciseCard
                  exercise={currentItem.exercise}
                  index={answeredCount}
                  total={items.length}
                  grade={grade}
                  onSubmit={handleAnswer}
                  onContinue={handleContinue}
                  pronunciationEnabled={settings?.pronunciationEnabled ?? false}
                  soundEnabled={settings?.soundEnabled ?? false}
                  hapticsEnabled={settings?.hapticsEnabled ?? false}
                  reducedMotion={prefersReducedMotion()}
                />
              )}
            </div>
          </>
        )}

        {/* Completion summary */}
        {summary && (
          <div className="pt-8 text-center anim-slide-up">
            <div className="text-[44px] leading-none">{summary.accuracy >= 80 ? '🎉' : summary.accuracy >= 50 ? '👏' : '💪'}</div>
            <h1 className="mt-3 text-[28px] font-bold tracking-[-0.02em] text-ink">Session complete</h1>
            <p className="mt-1 text-[15px] text-muted">
              {summary.correct} correct · {summary.incorrect} incorrect
              {summary.typos > 0 ? ` · ${summary.typos} spelling ${summary.typos === 1 ? 'note' : 'notes'}` : ''}
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat label="Accuracy" value={`${summary.accuracy}%`} tone={summary.accuracy >= 80 ? 'good' : 'accent'} />
              <Stat label="Exercises" value={summary.total} />
              <Stat label="Time" value={`${Math.max(1, Math.round(elapsed / 60))}m`} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Nouns" value={`${summary.bySection.nouns.correct}/${summary.bySection.nouns.total}`} />
              <Stat label="Verbs" value={`${summary.bySection.verbs.correct}/${summary.bySection.verbs.total}`} />
              <Stat label="Sentences" value={`${summary.bySection.sentences.correct}/${summary.bySection.sentences.total}`} />
            </div>

            <Card className="mt-4 p-4 text-left">
              <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em]">Scheduled for review</div>
              <div className="mt-1 text-[15px] text-ink">
                {summary.scheduledForReview.length === 0
                  ? 'Nothing — everything stayed in long-term review. '
                  : `${summary.scheduledForReview.length} item${summary.scheduledForReview.length === 1 ? '' : 's'} will come back soon. `}
                The FSRS scheduler decides when.
              </div>
              {summary.weakAreas.length > 0 && (
                <div className="mt-3">
                  <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.08em]">Worth another look</div>
                  <ul className="mt-1.5 space-y-1">
                    {summary.weakAreas.slice(0, 3).map((w, i) => (
                      <li key={i} className="text-[14px] text-ink">
                        · {w.label} <span className="text-muted">({w.detail})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {streak > 0 && settings?.streaksEnabled && (
                <div className="mt-3 text-[14px] text-muted">
                  🔥 Practice streak: <strong className="text-ink">{streak} day{streak === 1 ? '' : 's'}</strong>
                </div>
              )}
            </Card>

            <div className="mt-6 flex flex-col gap-2.5">
              <Button onClick={onClose} className="w-full">
                Done
              </Button>
              <Button variant="secondary" onClick={onStartAnother} className="w-full">
                Start another session
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-muted">
              Sessions are finite on purpose. Come back tomorrow — or start another one now if you&apos;re enjoying it.
            </p>
          </div>
        )}

        {/* Abandon confirmation: partial sessions never count as completed */}
        {abandonConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/45 flex items-end sm:items-center justify-center p-4">
            <Card className="w-full max-w-sm p-5">
              <h3 className="text-[17px] font-bold text-ink">End this session?</h3>
              <p className="mt-1.5 text-[14px] text-muted">
                Your answered exercises are saved, but an unfinished session doesn&apos;t count toward your daily goal or streak.
              </p>
              <div className="mt-4 flex gap-2.5">
                <Button variant="secondary" className="flex-1" onClick={() => setAbandonConfirm(false)}>
                  Keep practicing
                </Button>
                <Button variant="danger" className="flex-1" onClick={onClose}>
                  End session
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
