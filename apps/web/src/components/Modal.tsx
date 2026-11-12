import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ children, onEscape, label, className }: { children: ReactNode; onEscape: () => void; label: string; className: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div ref={root} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape(); }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(el => !el.closest('[inert]') && el.getClientRects().length > 0);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (!first) { e.preventDefault(); return; }
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { e.preventDefault(); first.focus(); }
    e.stopPropagation();
  }}>{children}</div>;
}
