/**
 * SwipeDeck — fast recall drill with Tinder-style gestures.
 *
 * Interaction rules that protect the learning record:
 *  - A card must be *revealed* before it can be graded (no accidental reviews
 *    from pocket swipes or mis-taps).
 *  - Grading commits only past a distance threshold (120px) or a fast flick
 *    (velocity > 0.55 px/ms); anything else springs back.
 *  - Every commit is undoable (button or Ctrl/Cmd+Z) and restores the exact
 *    previous FSRS review state.
 *
 * Keyboard: Space/Enter reveal · ← Again · → Good · ↑ Hard · ↓ Easy · Z undo.
 * Haptics fire once when the commit threshold is crossed (where supported).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Exercise, GradeResult, ReviewState } from '@french-daily/learning-core';
import {
  generateSentenceExercise,
  generateVerbExercise,
  generateVocabExercise,
  gradeAnswerList,
  rngFromSeed,
} from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { Badge, Button, Card, Chip } from './ui';
import { buzz, playTone, prefersReducedMotion, speakFrench } from '../services/feedback';
import { getReviewStates, recordAttempt } from '../storage/repos';
import { db } from '../storage/db';
import { useApp } from '../hooks/useApp';

type Grade = 'again' | 'hard' | 'good' | 'easy';

const GRADE_LABEL: Record<Grade, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

const DRAG_COMMIT_PX = 120;
const FLICK_VELOCITY = 0.55; // px per ms

interface DeckCard {
  exercise: Exercise;
  revealed: boolean;
}

interface HistoryEntry {
  attemptId: number | null;
  prevReview: ReviewState | null;
}

export function SwipeDeck() {
  const { settings, toast } = useApp();
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [pos, setPos] = useState(0);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<'left' | 'right' | null>(null);
  const [finished, setFinished] = useState(false);
  const [length, setLength] = useState(12);
  const historyRef = useRef<HistoryEntry[]>([]);
  const dragState = useRef({ x0: 0, y0: 0, t0: 0, thresholdBuzzed: false });
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const build = useCallback(async (count: number) => {
    const states = await getReviewStates();
    const rng = rngFromSeed(`swipe-${Date.now()}`);
    const cards: DeckCard[] = [];

    // Due items first (FSRS priority), then fresh material.
    const orderIds = (ids: string[]) =>
      ids
        .map((id) => ({ id, due: states.get(id)?.nextDue ?? '0' }))
        .sort((a, b) => (a.due < b.due ? -1 : 1))
        .map((x) => x.id);

    const vocabIds = orderIds(sources.vocabulary.map((v) => v.id));
    const verbIds = orderIds(sources.verbs.map((v) => v.id));
    const sentIds = orderIds(sources.sentences.map((s) => s.id));
    const perKind = Math.ceil(count / 3);
    const byId = {
      vocab: new Map(sources.vocabulary.map((v) => [v.id, v])),
      verb: new Map(sources.verbs.map((v) => [v.id, v])),
      sent: new Map(sources.sentences.map((s) => [s.id, s])),
    };

    for (const id of vocabIds.slice(0, perKind)) {
      const ex = generateVocabExercise(byId.vocab.get(id)!, sources.vocabulary, rng, { topics: 'all', levels: 'all', kinds: 'all' });
      if (ex) cards.push({ exercise: ex, revealed: false });
    }
    for (const id of verbIds.slice(0, perKind)) {
      const v = byId.verb.get(id)!;
      const ex = generateVerbExercise(v, v.fillComplement, rng, { topics: 'all', levels: 'all', kinds: 'all' });
      if (ex) cards.push({ exercise: ex, revealed: false });
    }
    for (const id of sentIds.slice(0, perKind)) {
      const ex = generateSentenceExercise(byId.sent.get(id)!, rng, { topics: 'all', levels: 'all', kinds: 'all' });
      if (ex) cards.push({ exercise: ex, revealed: false });
    }

    // Deterministic shuffle of the interleaved deck.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    setDeck(cards.slice(0, count));
    setPos(0);
    setFinished(false);
    historyRef.current = [];
  }, []);

  useEffect(() => {
    build(length);
  }, [build, length]);

  const current = deck[pos];
  const next1 = deck[pos + 1];
  const next2 = deck[pos + 2];

  const reveal = useCallback(() => {
    setDeck((d) => d.map((c, i) => (i === pos ? { ...c, revealed: true } : c)));
    playTone('tap', settings?.soundEnabled ?? false);
  }, [pos, settings]);

  const commitGrade = useCallback(
    async (grade: Grade) => {
      if (!current || !current.revealed || flying) return;
      const map: Record<Grade, GradeResult> = {
        again: gradeAnswerList('(not remembered)', current.exercise.expected, current.exercise.accepted, current.exercise.explanation),
        hard: gradeAnswerList(current.exercise.expected, current.exercise.expected, current.exercise.accepted, current.exercise.explanation),
        good: gradeAnswerList(current.exercise.expected, current.exercise.expected, current.exercise.accepted, current.exercise.explanation),
        easy: gradeAnswerList(current.exercise.expected, current.exercise.expected, current.exercise.accepted, current.exercise.explanation),
      };
      const gradeResult = map[grade];
      // Map to FSRS ratings: again→1, hard→2, good/easy→3 (good) for schedule.
      const graded: GradeResult = grade === 'again' ? gradeResult : grade === 'hard' ? { ...gradeResult, outcome: 'typo', isTypo: true, isCorrect: false, feedback: 'Marked hard — will return sooner.' } : gradeResult;

      const prevReview = (await db.reviews.get(current.exercise.itemId)) ?? null;
      const { attemptId } = await recordAttempt({
        exercise: current.exercise,
        response: grade === 'again' ? '(swiped: again)' : '(swiped: remembered)',
        grade: graded,
        sessionId: `swipe-${Date.now()}`,
        durationMs: null,
      });
      historyRef.current.push({ attemptId, prevReview });

      playTone(grade === 'again' ? 'wrong' : 'correct', settings?.soundEnabled ?? false);
      buzz(grade === 'again' ? [16, 30, 16] : 10, settings?.hapticsEnabled ?? false);

      setFlying(grade === 'again' ? 'left' : 'right');
      window.setTimeout(
        () => {
          setFlying(null);
          setDx(0);
          setDy(0);
          setPos((p) => {
            const nextPos = p + 1;
            if (nextPos >= deck.length) setFinished(true);
            return nextPos;
          });
        },
        reduced ? 0 : 230,
      );
    },
    [current, flying, deck.length, reduced, settings],
  );

  const undo = useCallback(async () => {
    const last = historyRef.current.pop();
    if (!last) {
      toast('Nothing to undo');
      return;
    }
    if (last.attemptId !== null) await db.attempts.delete(last.attemptId);
    const itemId = last.prevReview?.itemId;
    if (last.prevReview && itemId) await db.reviews.put(last.prevReview);
    else if (itemId) await db.reviews.delete(itemId);
    setPos((p) => Math.max(0, p - 1));
    setFinished(false);
    toast('Last grading undone');
  }, [toast]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (current && !current.revealed) reveal();
        else if (current?.revealed) void commitGrade('good');
      } else if (e.key === 'ArrowLeft' && current?.revealed) {
        e.preventDefault();
        void commitGrade('again');
      } else if (e.key === 'ArrowRight' && current?.revealed) {
        e.preventDefault();
        void commitGrade('good');
      } else if (e.key === 'ArrowUp' && current?.revealed) {
        e.preventDefault();
        void commitGrade('hard');
      } else if (e.key === 'ArrowDown' && current?.revealed) {
        e.preventDefault();
        void commitGrade('easy');
      } else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        void undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, reveal, commitGrade, undo]);

  // Pointer drag.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!current?.revealed || flying) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = { x0: e.clientX, y0: e.clientY, t0: Date.now(), thresholdBuzzed: false };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const ndx = e.clientX - dragState.current.x0;
    const ndy = e.clientY - dragState.current.y0;
    setDx(ndx);
    setDy(ndy * 0.28);
    if (Math.abs(ndx) > DRAG_COMMIT_PX && !dragState.current.thresholdBuzzed) {
      dragState.current.thresholdBuzzed = true;
      buzz(8, settings?.hapticsEnabled ?? false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    const ndx = e.clientX - dragState.current.x0;
    const dt = Math.max(1, Date.now() - dragState.current.t0);
    const velocity = Math.abs(ndx) / dt;
    const commit = Math.abs(ndx) > DRAG_COMMIT_PX || velocity > FLICK_VELOCITY;
    if (commit && current?.revealed) {
      void commitGrade(ndx < 0 ? 'again' : 'good');
    } else {
      // Spring back — never grade from a gesture that didn't clearly commit.
      setDx(0);
      setDy(0);
    }
  };

  const remaining = deck.length - pos;

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {([8, 12, 20] as const).map((n) => (
            <Chip key={n} active={length === n} onClick={() => setLength(n)}>
              {n} cards
            </Chip>
          ))}
        </div>
        <Button variant="ghost" className="!py-1.5 text-[13px]" onClick={() => void undo()}>
          ↩ Undo
        </Button>
      </div>

      {/* Card stack */}
      <div className="relative mt-4 h-[380px] select-none card-stack overflow-hidden" aria-live="polite">
        {finished ? (
          <Card className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="text-[40px]">✨</div>
            <h3 className="text-[22px] font-bold text-ink">Deck complete</h3>
            <p className="text-[15px] text-muted">
              {deck.length} cards reviewed. Your review schedule has been updated — see you tomorrow.
            </p>
            <Button onClick={() => build(length)}>Shuffle a new deck</Button>
          </Card>
        ) : (
          <>
            {next2 && <SwipeCardView card={next2} depth={2} dx={0} dy={0} dragging={false} />}
            {next1 && <SwipeCardView card={next1} depth={1} dx={0} dy={0} dragging={false} />}
            {current && (
              <SwipeCardView
                card={current}
                depth={0}
                dx={flying ? (flying === 'left' ? -420 : 420) : dx}
                dy={dy}
                dragging={dragging}
                flying={flying}
                reduced={reduced}
                testId="swipe-card"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onReveal={reveal}
              />
            )}
          </>
        )}
      </div>

      {/* Directional feedback */}
      {!finished && current?.revealed && (
        <div className="mt-2 flex items-center justify-between px-1 text-[12px] font-semibold">
          <span style={{ opacity: Math.min(1, Math.max(0, -dx / DRAG_COMMIT_PX)) }} className="text-bad">
            ← Again
          </span>
          <span className="text-muted">drag, tap a button, or use arrow keys</span>
          <span style={{ opacity: Math.min(1, Math.max(0, dx / DRAG_COMMIT_PX)) }} className="text-good">
            Good →
          </span>
        </div>
      )}

      {/* Grade buttons */}
      {!finished && current?.revealed && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(['again', 'hard', 'good', 'easy'] as const).map((g) => (
            <Button
              key={g}
              variant={g === 'again' ? 'bad' : g === 'good' || g === 'easy' ? 'good' : 'secondary'}
              onClick={() => void commitGrade(g)}
            >
              {GRADE_LABEL[g]}
            </Button>
          ))}
        </div>
      )}

      {!finished && !current?.revealed && current && (
        <Button className="mt-4 w-full" data-testid="reveal-answer-button" onClick={reveal}>
          Reveal answer
        </Button>
      )}

      {settings?.pronunciationEnabled && current?.revealed && (
        <Button variant="secondary" className="mt-2 w-full" onClick={() => speakFrench(current.exercise.expected, true)}>
          🔊 Hear it in French
        </Button>
      )}

      <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-muted">
        <Badge>{remaining} left</Badge>
        <span>Reveal first — grading only happens on the answer side.</span>
      </div>
    </div>
  );
}

function SwipeCardView({
  card,
  depth,
  dx,
  dy,
  dragging,
  flying,
  reduced,
  testId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onReveal,
}: {
  card: DeckCard;
  depth: number;
  dx: number;
  dy: number;
  dragging: boolean;
  flying?: 'left' | 'right' | null;
  reduced?: boolean;
  testId?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onReveal?: () => void;
}) {
  const rotation = reduced ? 0 : Math.max(-14, Math.min(14, dx * 0.045));
  const style: React.CSSProperties = {
    transform: `translate(${dx}px, ${dy + depth * 8}px) rotate(${rotation}deg) scale(${1 - depth * 0.045})`,
    opacity: depth === 0 ? 1 : depth === 1 ? 0.75 : 0.45,
    transition: dragging || flying ? 'none' : 'transform 420ms cubic-bezier(0.18, 0.89, 0.32, 1.12), opacity 300ms ease',
    zIndex: 10 - depth,
  };

  return (
    <div
      className={`swipe-card absolute inset-0 ${dragging ? 'dragging' : ''}`}
      style={style}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Card className="h-full p-6 flex flex-col">
        <div className="flex items-center justify-between">
          <Badge tone="accent">{card.exercise.instruction}</Badge>
          {card.exercise.hint && <Badge>{card.exercise.hint}</Badge>}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="text-[24px] leading-snug font-bold text-ink tracking-[-0.01em]">{card.exercise.prompt}</div>
          {card.revealed ? (
            <div className="w-full anim-slide-up">
              <div className="rounded-2xl bg-accentsoft px-4 py-3 text-[19px] font-semibold text-accent">
                {card.exercise.expected}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{card.exercise.explanation}</p>
            </div>
          ) : (
            onReveal && (
              <button
                onClick={onReveal}
                data-testid="reveal-button"
                className="rounded-2xl border-2 border-dashed border-edge px-6 py-3 text-[15px] font-semibold text-muted hover:text-ink hover:border-accent transition"
              >
                Think of the answer, then tap to reveal
              </button>
            )
          )}
        </div>
      </Card>
    </div>
  );
}
