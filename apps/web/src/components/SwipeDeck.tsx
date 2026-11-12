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
  buildSession, customSessionConfig, reviewPriority, todayLocal,
  gradeAnswerList,
} from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { Badge, Button, Card, Chip } from './ui';
import { buzz, playTone, prefersReducedMotion, speakFrench } from '../services/feedback';
import { getReviewStates, recordAttempt, recordSessionCompletion, undoAttempt } from '../storage/repos';
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
  cardId: string;
  grade: GradeResult;
  section: 'nouns' | 'verbs' | 'sentences';
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
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const buildVersion = useRef(0);
  const sessionId = useRef('');
  const startedAt = useRef(Date.now());
  const presentedAt = useRef(Date.now());
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const build = useCallback(async (count: number) => {
    const version = ++buildVersion.current;
    const states = await getReviewStates();
    const today = todayLocal();
    const due = buildSession(customSessionConfig({ mode: 'review', nouns: count, verbs: 0, sentences: 0 }), sources, states, today).items;
    const candidates = buildSession(customSessionConfig({ nouns: count, verbs: count, sentences: count }), sources, states, today, `swipe-${Date.now()}`).items;
    const used = new Set(due.map(x => x.exercise.itemId));
    const fresh = candidates.filter(x => !states.has(x.exercise.id) && !used.has(x.exercise.itemId));
    const cards: DeckCard[] = [...due, ...fresh].sort((a,b) => reviewPriority(states.get(a.exercise.id), today) - reviewPriority(states.get(b.exercise.id), today)).map(x => ({ exercise: x.exercise, revealed: false }));
    if (version !== buildVersion.current) return;
    sessionId.current = `swipe-${crypto.randomUUID()}`;
    startedAt.current = presentedAt.current = Date.now();
    setDeck(cards.slice(0, count));
    setPos(0);
    setFinished(false);
    historyRef.current = [];
  }, []);

  useEffect(() => {
    build(length);
    return () => { window.clearTimeout(timer.current); };
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
      if (!current || !current.revealed || flying || busy.current) return;
      busy.current = true;
      try {
        const gradeResult = gradeAnswerList(grade === 'again' ? '(not remembered)' : current.exercise.expected, current.exercise.expected, current.exercise.accepted, current.exercise.explanation);
        const prevReview = (await db.reviews.get(current.exercise.id)) ?? null;
        const { attemptId } = await recordAttempt({
          exercise: current.exercise, response: `(self-assessed: ${grade})`, grade: gradeResult,
          rating: ({ again: 1, hard: 2, good: 3, easy: 4 } as const)[grade],
          sessionId: sessionId.current, durationMs: Date.now() - presentedAt.current,
        });
        historyRef.current.push({ attemptId, prevReview, cardId: current.exercise.id, grade: gradeResult,
          section: current.exercise.reviewKind === 'vocab' ? 'nouns' : current.exercise.reviewKind === 'verb' ? 'verbs' : 'sentences' });
        if (pos + 1 >= deck.length) {
          const entries = historyRef.current;
          const correct = entries.filter(x => x.grade.isCorrect).length;
          const bySection = { nouns: { total: 0, correct: 0 }, verbs: { total: 0, correct: 0 }, sentences: { total: 0, correct: 0 } };
          for (const h of entries) { bySection[h.section].total++; if (h.grade.isCorrect) bySection[h.section].correct++; }
          await recordSessionCompletion({ total: entries.length, correct, incorrect: entries.length - correct, accuracy: Math.round(correct / entries.length * 100), typos: 0, bySection, scheduledForReview: [], weakAreas: [], streakDays: 0, completedOn: todayLocal() }, 'custom', Date.now() - startedAt.current, sessionId.current).catch(() => toast('Reviews saved. Session summary could not be saved.', 'error'));
        }
        playTone(grade === 'again' ? 'wrong' : 'correct', settings?.soundEnabled ?? false);
        buzz(grade === 'again' ? [16, 30, 16] : 10, settings?.hapticsEnabled ?? false);
        setFlying(grade === 'again' ? 'left' : 'right');
        timer.current = window.setTimeout(() => {
          setFlying(null); setDx(0); setDy(0); setPos(p => p + 1);
          if (pos + 1 >= deck.length) setFinished(true);
          presentedAt.current = Date.now(); busy.current = false;
        }, reduced ? 0 : 230);
      } catch {
        busy.current = false; setDx(0); setDy(0);
        toast('Could not save this review. Please try again.', 'error');
      }
    },
    [current, flying, deck.length, pos, reduced, settings, toast],
  );

  const undo = useCallback(async () => {
    if (busy.current) return;
    const last = historyRef.current[historyRef.current.length - 1];
    if (!last || last.attemptId === null) { toast('Nothing to undo'); return; }
    busy.current = true;
    try {
      await undoAttempt(last.attemptId, last.cardId, last.prevReview, sessionId.current);
      historyRef.current.pop();
      setPos(p => Math.max(0, p - 1)); setFinished(false);
      toast('Last grading undone');
    } catch { toast('Undo could not be saved. Please try again.', 'error'); }
    finally { busy.current = false; }
  }, [toast]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, button, [contenteditable=true], [role=dialog]')) return;
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
    if (!current?.revealed || flying || busy.current) return;
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
    const horizontal = Math.abs(ndx) > Math.abs(e.clientY - dragState.current.y0) * 1.2;
    const commit = horizontal && (Math.abs(ndx) > DRAG_COMMIT_PX || (Math.abs(ndx) >= 40 && velocity > FLICK_VELOCITY));
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
            <Chip key={n} active={length === n} onClick={() => { if (!busy.current) setLength(n); }}>
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
                onPointerCancel={() => { setDragging(false); setDx(0); setDy(0); }}
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
  onPointerCancel,
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
  onPointerCancel?: () => void;
  onReveal?: () => void;
}) {
  const rotation = reduced ? 0 : Math.max(-14, Math.min(14, dx * 0.045));
  const style: React.CSSProperties = {
    transform: `translate(${dx}px, ${dy + depth * 8}px) rotate(${rotation}deg) scale(${1 - depth * 0.045})`,
    opacity: depth === 0 ? 1 : depth === 1 ? 0.75 : 0.45,
    transition: reduced ? 'none' : dragging ? 'none' : flying ? 'transform 230ms ease-out' : 'transform 420ms cubic-bezier(0.18, 0.89, 0.32, 1.12), opacity 300ms ease',
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
      onPointerCancel={onPointerCancel}
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
