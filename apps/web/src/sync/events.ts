export const SESSION_SAVED = 'french-daily:session-saved';
export function requestSessionSync() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_SAVED));
}
