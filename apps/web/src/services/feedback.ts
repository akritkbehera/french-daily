/**
 * Feedback services: sound, haptics, pronunciation.
 *
 * All effects are optional and configurable in Settings. Sounds are generated
 * with WebAudio (no audio files); pronunciation uses the built-in Web Speech
 * API (no external service, works offline when voices are installed).
 */

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  audioCtx ??= new AC();
  return audioCtx;
}

export type FeedbackTone = 'correct' | 'wrong' | 'complete' | 'tap';

/** Short, subtle generated tones. */
export function playTone(tone: FeedbackTone, enabled = true): void {
  if (!enabled) return;
  const ac = ctx();
  if (!ac) return;
  const notes: Record<FeedbackTone, { freq: number; dur: number; type: OscillatorType; gain: number }> = {
    correct: { freq: 660, dur: 0.12, type: 'sine', gain: 0.06 },
    wrong: { freq: 220, dur: 0.14, type: 'triangle', gain: 0.05 },
    complete: { freq: 523, dur: 0.28, type: 'sine', gain: 0.07 },
    tap: { freq: 440, dur: 0.05, type: 'sine', gain: 0.03 },
  };
  const n = notes[tone];
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type;
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(n.gain, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + n.dur);
    if (tone === 'complete') {
      const osc2 = ac.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 784;
      const gain2 = ac.createGain();
      gain2.gain.setValueAtTime(n.gain, ac.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + n.dur + 0.14);
      osc2.connect(gain2).connect(ac.destination);
      osc2.start(ac.currentTime + 0.12);
      osc2.stop(ac.currentTime + n.dur + 0.2);
    }
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + n.dur + 0.02);
  } catch {
    // Audio is a progressive enhancement — never break the session.
  }
}

/** Haptic feedback where supported (Android Chrome); silently ignored elsewhere. */
export function buzz(pattern: number | number[] = 12, enabled = true): void {
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not allowed */
    }
  }
}

/** Speak French text with the best available fr-FR voice. */
export function speakFrench(text: string, enabled = true): boolean {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const fr = voices.find((v) => v.lang.toLowerCase().startsWith('fr'));
    if (fr) utter.voice = fr;
    utter.lang = fr?.lang ?? 'fr-FR';
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}

/** True when the OS reports reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
