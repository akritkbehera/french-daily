/**
 * Review — the FSRS-driven review queue: what's due now, what's coming,
 * and one-tap review sessions sized to the queue.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReviewState } from '@french-daily/learning-core';
import { difficultyScore, estimatedRetention, todayLocal, shortDateLabel, reviewPriority } from '@french-daily/learning-core';
import { labelForContentId } from '@french-daily/french-data';
import { Badge, Button, Card, ProgressBar, Screen, SectionTitle, Stat } from '../components/ui';
import { getReviewStates } from '../storage/repos';
import { useApp } from '../hooks/useApp';

export function ReviewScreen() {
  const { startReviewSession } = useApp();
  const [reviews, setReviews] = useState<Map<string, ReviewState>>(new Map());

  useEffect(() => {
    getReviewStates().then(setReviews);
  }, []);

  const today = todayLocal();

  const { due, upcoming, overdue } = useMemo(() => {
    const all = [...reviews.values()];
    const due = all
      .filter((r) => r.nextDue <= today)
      .sort((a, b) => reviewPriority(a, today) - reviewPriority(b, today));
    const overdue = due.filter((r) => r.nextDue < today);
    const upcoming = all
      .filter((r) => r.nextDue > today)
      .sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
    return { due, upcoming, overdue };
  }, [reviews, today]);

  return (
    <Screen>
      <SectionTitle>Review</SectionTitle>
      <p className="text-[14px] text-muted -mt-1 mb-4">
        Scheduling is handled by FSRS: items return when your recall probability is projected to hit the target — not on a fixed loop.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Due now" value={due.length} tone={due.length > 0 ? 'accent' : 'good'} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length > 0 ? 'bad' : 'neutral'} />
        <Stat label="Upcoming" value={upcoming.length} />
      </div>

      <Card className="mt-4 p-5">
        <h3 className="text-[17px] font-bold text-ink">Review session</h3>
        <p className="mt-1 text-[13.5px] text-muted">
          {due.length === 0
            ? 'Nothing is due right now — review when items come due, or run a practice session instead.'
            : `Clear ${due.length} due item${due.length === 1 ? '' : 's'}, hardest first.`}
        </p>
        <Button className="mt-3 w-full" disabled={due.length === 0} onClick={() => startReviewSession('short')}>
          Start review session →
        </Button>
      </Card>

      {/* Due list */}
      {due.length > 0 && (
        <div className="mt-6">
          <SectionTitle>Due now</SectionTitle>
          <div className="space-y-2">
            {due.slice(0, 12).map((r) => (
              <ReviewRow key={r.itemId} state={r} today={today} />
            ))}
            {due.length > 12 && <div className="text-[12px] text-muted">…and {due.length - 12} more</div>}
          </div>
        </div>
      )}

      {/* Coming up */}
      {upcoming.length > 0 && (
        <div className="mt-6">
          <SectionTitle>Coming up</SectionTitle>
          <div className="space-y-2">
            {upcoming.slice(0, 8).map((r) => (
              <ReviewRow key={r.itemId} state={r} today={today} />
            ))}
          </div>
        </div>
      )}

      {reviews.size === 0 && (
        <Card className="mt-6 p-8 text-center">
          <div className="text-[32px]">🌱</div>
          <h3 className="mt-2 text-[17px] font-bold text-ink">No review history yet</h3>
          <p className="mt-1 text-[14px] text-muted">
            Complete a practice session and your personal review schedule will start building itself.
          </p>
        </Card>
      )}
    </Screen>
  );
}

function ReviewRow({ state, today }: { state: ReviewState; today: string }) {
  const est = estimatedRetention(state, today);
  const diff = difficultyScore(state);
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink truncate">{labelForContentId(state.itemId)}</div>
          <div className="text-[12px] text-muted mt-0.5">
            due {state.nextDue <= today ? 'now' : shortDateLabel(state.nextDue)} · interval {state.interval}d ·{' '}
            {state.lapseCount} lapse{state.lapseCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {est !== null && <Badge tone={est >= 0.85 ? 'good' : est >= 0.7 ? 'warn' : 'bad'}>R {Math.round(est * 100)}%</Badge>}
          <Badge tone={diff > 0.6 ? 'bad' : diff > 0.35 ? 'warn' : 'neutral'}>
            {diff > 0.6 ? 'hard' : diff > 0.35 ? 'medium' : 'easy'}
          </Badge>
        </div>
      </div>
      <div className="mt-2">
        <ProgressBar value={est ? est * 100 : 0} max={100} tone={est && est >= 0.85 ? 'good' : 'warn'} />
      </div>
    </Card>
  );
}
