import { afterEach, beforeEach, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { OwnerGate } from './OwnerGate';
import { getGitHubSession } from '../sync/auth';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(cleanup);
it('offers GitHub sign-in without any token entry', () => {
  render(<OwnerGate><p>Practice</p></OwnerGate>);
  expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByText('Practice')).toBeNull();
});
it('keeps local practice available while GitHub is disconnected', () => {
  render(<OwnerGate><p>Practice</p></OwnerGate>);
  fireEvent.click(screen.getByRole('button', { name: 'Continue on this device' }));
  expect(screen.getByText('Practice')).toBeInTheDocument();
  expect(getGitHubSession()).toBeNull();
});
it('rejects expired or wrong-owner stored sessions', () => {
  localStorage.setItem('french-daily-github-auth', JSON.stringify({ token: 'opaque-session', login: 'someone-else', expiresAt: Date.now() + 60000 }));
  expect(getGitHubSession()).toBeNull();
  localStorage.setItem('french-daily-github-auth', JSON.stringify({ token: 'opaque-session', login: 'akritkbehera', expiresAt: Date.now() - 1 }));
  expect(getGitHubSession()).toBeNull();
});
