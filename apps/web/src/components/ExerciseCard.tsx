/**
 * ExerciseCard — renders every exercise kind with comfortable mobile input,
 * immediate (subtle) feedback, the correct French answer, an explanation and
 * optional pronunciation playback.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { Exercise, GradeResult } from '@french-daily/learning-core';
import { tokenizeSentence } from '@french-daily/learning-core';
import { Badge, Button } from './ui';
import { buzz, playTone, speakFrench } from '../services/feedback';

export interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
  total: number;
  grade: GradeResult | null;
  onSubmit: (response: string, selectionIndex?: number) => void;
  onContinue: () => void;
  pronunciationEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
}

const ARTICLE_OPTIONS = ['le', 'la', "l'", 'les', 'un', 'une', 'des'];

export function ExerciseCard({
  exercise,
  index,
  total,
  grade,
  onSubmit,
  onContinue,
  pronunciationEnabled,
  reducedMotion,
}: ExerciseCardProps) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [tiles, setTiles] = useState<number[]>([]); // indices into exercise tokens
  const inputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const revealed = grade !== null;

  useEffect(() => {
    setText('');
    setSelected(null);
    setTiles([]);
  }, [exercise.id]);

  useEffect(() => {
    if (!revealed && (exercise.kind === 'translation-typed' || exercise.kind === 'conjugation-fill' || exercise.kind === 'conjugation-direct')) {
      inputRef.current?.focus();
    }
    if (!revealed && exercise.kind === 'sentence-construction') {
      textAreaRef.current?.focus();
    }
  }, [exercise.id, revealed, exercise.kind]);

  const tokens = exercise.kind === 'word-order' ? exercise.tokens : [];

  const submitText = () => {
    if (revealed) return;
    const value = text.trim();
    if (value.length === 0 && exercise.kind !== 'word-order') return;
    onSubmit(value);
  };

  const submitWordOrder = () => {
    if (revealed || tiles.length !== tokens.length) return;
    onSubmit(tiles.map((i) => tokens[i]).join(' '));
  };

  const submitSelection = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    const value = exercise.kind === 'multiple-choice' ? exercise.options[idx] : (exercise as { options: string[] }).options[idx];
    onSubmit(value, idx);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (revealed) onContinue();
      else if (exercise.kind === 'word-order') submitWordOrder();
      else if (exercise.kind === 'translation-typed' || exercise.kind === 'conjugation-fill' || exercise.kind === 'conjugation-direct' || exercise.kind === 'sentence-construction') submitText();
    }
    if (!revealed && (exercise.kind === 'multiple-choice' || exercise.kind === 'gender-select')) {
      const num = Number(e.key);
      const options = (exercise as { options: string[] }).options;
      if (num >= 1 && num <= options.length) submitSelection(num - 1);
    }
  };

  const resultTone = grade?.isCorrect ? 'good' : grade?.isTypo ? 'warn' : 'bad';

  return (
    <div
      className={`w-full ${!reducedMotion && grade ? (grade.isCorrect ? 'anim-pop' : 'anim-shake') : ''}`}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge tone="accent">{exercise.instruction}</Badge>
          {exercise.hint && !revealed && <Badge>{exercise.hint}</Badge>}
        </div>
        <div className="text-[12px] text-muted tabular-nums">
          {index + 1} / {total}
        </div>
      </div>

      {/* Prompt */}
      <h2 className="text-[26px] leading-[1.25] font-bold text-ink tracking-[-0.015em]">{exercise.prompt}</h2>

      {/* Sentence construction: bigger writing area */}
      <div className="mt-5">
        {exercise.kind === 'translation-typed' ||
        exercise.kind === 'conjugation-fill' ||
        exercise.kind === 'conjugation-direct' ? (
          <input
            ref={inputRef}
            type="text"
            value={text}
            disabled={revealed}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your answer"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-label="Your answer"
            className={`w-full rounded-2xl border-2 bg-surface px-4 py-4 text-[19px] text-ink placeholder:text-muted/60
              transition-colors disabled:opacity-80 ${revealed ? 'border-edge' : 'border-edge focus:border-accent'}`}
          />
        ) : null}

        {exercise.kind === 'sentence-construction' ? (
          <textarea
            ref={textAreaRef}
            value={text}
            disabled={revealed}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Write the full sentence…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Your sentence"
            className={`w-full rounded-2xl border-2 bg-surface px-4 py-3.5 text-[18px] leading-relaxed text-ink placeholder:text-muted/60
              transition-colors resize-none disabled:opacity-80 ${revealed ? 'border-edge' : 'border-edge focus:border-accent'}`}
          />
        ) : null}

        {(exercise.kind === 'multiple-choice' || exercise.kind === 'gender-select') && (
          <div className={`grid gap-2.5 ${exercise.kind === 'gender-select' ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {(exercise as { options: string[] }).options.map((opt, i) => {
              const isCorrectOpt = opt === exercise.expected;
              const chosen = selected === i;
              return (
                <button
                  key={`${opt}-${i}`}
                  disabled={revealed}
                  onClick={() => submitSelection(i)}
                  className={`rounded-2xl border-2 px-4 py-3.5 text-[17px] font-semibold transition
                    ${revealed
                      ? isCorrectOpt
                        ? 'border-good bg-goodsoft text-good'
                        : chosen
                          ? 'border-bad bg-badsoft text-bad'
                          : 'border-edge bg-surface text-muted opacity-70'
                      : 'border-edge bg-surface text-ink hover:border-accent active:scale-[0.97]'}
                  `}
                >
                  {opt}
                  <span className="ml-2 text-[11px] font-medium text-muted">{i + 1}</span>
                </button>
              );
            })}
          </div>
        )}

        {exercise.kind === 'word-order' && (
          <div className="space-y-3">
            <div
              className="min-h-[58px] rounded-2xl border-2 border-dashed border-edge bg-surface p-2.5 flex flex-wrap gap-2"
              aria-label="Your sentence"
            >
              {tiles.length === 0 && <span className="text-[14px] text-muted px-2 py-2">Tap the words below to build the sentence…</span>}
              {tiles.map((tokIdx, pos) => (
                <button
                  key={`placed-${pos}-${tokIdx}`}
                  disabled={revealed}
                  onClick={() => setTiles((t) => t.filter((_, p) => p !== pos))}
                  className="rounded-xl bg-accent text-white px-3 py-2 text-[15px] font-semibold active:scale-95 transition"
                >
                  {tokens[tokIdx]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {tokens.map((tok, i) =>
                tiles.includes(i) ? null : (
                  <button
                    key={`bank-${i}`}
                    disabled={revealed}
                    onClick={() => setTiles((t) => [...t, i])}
                    className="rounded-xl border border-edge bg-surface px-3 py-2 text-[15px] font-semibold text-ink active:scale-95 transition"
                  >
                    {tok}
                  </button>
                ),
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() => setTiles((t) => t.slice(0, -1))}
              disabled={revealed || tiles.length === 0}
              className="!py-2 text-[13px]"
            >
              Undo word
            </Button>
          </div>
        )}
      </div>

      {/* Actions */}
      {!revealed && (
        <div className="mt-5 flex items-center gap-3">
          {exercise.kind === 'word-order' ? (
            <Button onClick={submitWordOrder} disabled={tiles.length !== tokens.length} className="flex-1">
              Check answer
            </Button>
          ) : (exercise.kind === 'multiple-choice' || exercise.kind === 'gender-select') ? null : (
            <Button onClick={submitText} disabled={text.trim().length === 0} className="flex-1">
              Check answer
            </Button>
          )}
          {pronunciationEnabled && exercise.kind !== 'word-order' && (
            <Button
              variant="secondary"
              aria-label="Listen to the prompt"
              onClick={() => speakFrench(exercise.kind === 'translation-typed' ? exercise.prompt : exercise.expected, true)}
            >
              🔊
            </Button>
          )}
        </div>
      )}

      {/* Feedback */}
      {revealed && grade && (
        <div
          className={`mt-5 rounded-2xl border p-4 anim-slide-up ${
            grade.isCorrect
              ? 'border-good/30 bg-goodsoft'
              : grade.isTypo
                ? 'border-warn/30 bg-warn/10'
                : 'border-bad/30 bg-badsoft'
          }`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-[15px] font-bold ${resultTone === 'good' ? 'text-good' : resultTone === 'warn' ? 'text-warn' : 'text-bad'}`}>
                {grade.feedback}
              </div>
              {!grade.isCorrect && (
                <div className="mt-2 text-[15px] text-ink">
                  <span className="text-muted">Correct answer: </span>
                  <strong>{exercise.expected}</strong>
                </div>
              )}
              {!grade.isCorrect && <div className="mt-2 text-[13px] leading-relaxed text-muted">{grade.explanation}</div>}
              {grade.isCorrect && <div className="mt-2 text-[13px] leading-relaxed text-muted">{exercise.explanation}</div>}
            </div>
            {pronunciationEnabled && (
              <Button
                variant="secondary"
                aria-label="Listen to the correct answer"
                className="!py-2 shrink-0"
                onClick={() => speakFrench(exercise.expected, true)}
              >
                🔊
              </Button>
            )}
          </div>
          <Button onClick={onContinue} className="mt-4 w-full" autoFocus>
            Continue →
          </Button>
        </div>
      )}
    </div>
  );
}

/** Side-effect helpers wired into the session runner. */
export function feedbackEffects(grade: GradeResult, opts: { sound: boolean; haptics: boolean }) {
  if (grade.isCorrect) playTone('correct', opts.sound);
  else playTone('wrong', opts.sound);
  buzz(grade.isCorrect ? 10 : [18, 40, 18], opts.haptics);
}

export { ARTICLE_OPTIONS, tokenizeSentence };
