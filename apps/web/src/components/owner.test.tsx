import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { OwnerGate, verifyOwner, hasOwnerSession } from './OwnerGate';

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('does not mount learning content before owner verification', () => {
  render(<OwnerGate><p>Private practice</p></OwnerGate>);
  expect(screen.queryByText('Private practice')).not.toBeInTheDocument();
});
it('rejects another GitHub account even with a valid token', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: 'someone-else' }) });
  await expect(verifyOwner('test-token', fetcher)).rejects.toThrow('another account');
  expect(hasOwnerSession()).toBe(false);
});
it('unlocks the owner and does not persist the token', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: 'akritkbehera' }) });
  vi.stubGlobal('fetch', fetcher);
  render(<OwnerGate><p>Private practice</p></OwnerGate>);
  fireEvent.change(screen.getByLabelText('GitHub personal access token'), { target: { value: 'test-token' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock my practice' }));
  await waitFor(() => expect(screen.getByText('Private practice')).toBeInTheDocument());
  expect(sessionStorage.getItem('french-daily-owner-session')).not.toContain('test-token');
  expect(localStorage.length).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
  expect(screen.queryByText('Private practice')).not.toBeInTheDocument();
});
it('rejects expired or malformed sessions', () => {
  sessionStorage.setItem('french-daily-owner-session', JSON.stringify({ login: 'akritkbehera', verifiedAt: Date.now() - 8 * 86400000 }));
  expect(hasOwnerSession()).toBe(false);
  sessionStorage.setItem('french-daily-owner-session', '{');
  expect(hasOwnerSession()).toBe(false);
});
