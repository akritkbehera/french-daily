import type { AttemptRecord } from '@french-daily/learning-core';
export function eventId(a: AttemptRecord): string {
  return a.eventId ?? `legacy:${JSON.stringify([a.itemId, a.timestamp, a.sessionId, a.response, a.outcome])}`;
}
