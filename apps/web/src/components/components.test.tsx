/**
 * UI component tests: exercise grading flow, navigation, keyboard shortcuts,
 * accessibility affordances.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { buildSession, defaultSessionConfig, gradeAnswerList, type Exercise, type SessionState } from '@french-daily/learning-core';
import { sources } from '@french-daily/french-data';
import { ExerciseCard } from './ExerciseCard';
import { Nav } from './Nav';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  const session: SessionState = buildSession(defaultSessionConfig('short'), sources, new Map(), '2026-11-12', 'ui-seed');
  return { ...session.items[0].exercise, ...overrides } as Exercise;
}

beforeEach(cleanup);

describe('ExerciseCard', () => {
  const baseProps = {
    index: 0,
    total: 9,
    grade: null,
    pronunciationEnabled: false,
    soundEnabled: false,
    hapticsEnabled: false,
    reducedMotion: true,
  };

  it('renders the prompt and accepts typed input', () => {
    const exercise = makeExercise({ kind: 'translation-typed', prompt: 'house', expected: 'la maison', accepted: [] });
    const onSubmit = vi.fn();
    render(<ExerciseCard {...baseProps} exercise={exercise} onSubmit={onSubmit} onContinue={vi.fn()} />);

    expect(screen.getByText('house')).toBeInTheDocument();
    const input = screen.getByLabelText('Your answer');
    fireEvent.change(input, { target: { value: 'la maison' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('la maison');
  });

  it('shows the correct answer and explanation after a wrong answer', () => {
    const exercise = makeExercise({
      kind: 'translation-typed',
      prompt: 'house',
      expected: 'la maison',
      accepted: [],
      explanation: 'Maison is feminine.',
    });
    const grade = gradeAnswerList('le jardin', 'la maison', [], 'Maison is feminine.');
    render(<ExerciseCard {...baseProps} exercise={exercise} grade={grade} onSubmit={vi.fn()} onContinue={vi.fn()} />);

    expect(screen.getByText(/la maison/)).toBeInTheDocument();
    expect(screen.getByText(/Maison is feminine/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/ })).toBeInTheDocument();
  });

  it('renders multiple-choice options and reports the selection', () => {
    const exercise = makeExercise({
      kind: 'multiple-choice',
      prompt: 'Which one means "house"?',
      expected: 'la maison',
      options: ['le jardin', 'la maison', 'la rue', 'le pont'],
      accepted: [],
    });
    const onSubmit = vi.fn();
    render(<ExerciseCard {...baseProps} exercise={exercise} onSubmit={onSubmit} onContinue={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /la maison/ }));
    expect(onSubmit).toHaveBeenCalledWith('la maison', 1);
  });

  it('renders gender-select as compact options', () => {
    const exercise = makeExercise({
      kind: 'gender-select',
      prompt: '___ maison',
      expected: 'la',
      options: ['le', 'la', "l'", 'les', 'un', 'une', 'des'],
      accepted: [],
    });
    render(<ExerciseCard {...baseProps} exercise={exercise} onSubmit={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(7);
  });

  it('continues with Enter after grading', () => {
    const exercise = makeExercise({ kind: 'translation-typed', prompt: 'house', expected: 'la maison' });
    const onContinue = vi.fn();
    const grade = gradeAnswerList('la maison', 'la maison');
    render(<ExerciseCard {...baseProps} exercise={exercise} grade={grade} onSubmit={vi.fn()} onContinue={onContinue} />);
    fireEvent.keyDown(document.activeElement ?? screen.getByRole('button', { name: /Continue/ }), { key: 'Enter' });
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('Nav', () => {
  it('renders all seven destinations and marks the active one', () => {
    const onNavigate = vi.fn();
    render(<Nav view="today" onNavigate={onNavigate} />);

    const navs = screen.getAllByRole('navigation');
    expect(navs.length).toBe(2); // sidebar + bottom bar

    const todayButtons = screen.getAllByRole('button', { name: 'Today' });
    for (const b of todayButtons) expect(b).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getAllByRole('button', { name: 'Progress' })[0]);
    expect(onNavigate).toHaveBeenCalledWith('progress');
  });

  it('covers every screen of the 7-screen IA', () => {
    render(<Nav view="settings" onNavigate={vi.fn()} />);
    for (const label of ['Today', 'Nouns', 'Verbs', 'Practice', 'Review', 'Progress', 'Settings']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    }
  });
});
