import { test, expect, type Page } from '@playwright/test';

async function storeRows(page: Page, name: string) {
  return page.evaluate(store => new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const open = indexedDB.open('french-daily');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => { resolve(request.result); database.close(); };
      request.onerror = () => { reject(request.error); database.close(); };
    };
  }), name);
}
async function unlockFixture(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('french-daily-owner-session', JSON.stringify({ login: 'akritkbehera', verifiedAt: Date.now() })));
  await page.goto('./');
  await expect(page.getByTestId('reveal-answer-button')).toBeVisible();
}

test('owner sign-in rejects others, accepts the owner, and locks again', async ({ page }) => {
  let login = 'another-user';
  await page.route('https://api.github.com/user', route => route.fulfill({ json: { login } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Start daily practice →' })).toHaveCount(0);
  await page.getByLabel('GitHub personal access token').fill('test-only-token');
  await page.getByRole('button', { name: 'Unlock my practice' }).click();
  await expect(page.getByRole('alert')).toContainText('another account');
  login = 'akritkbehera';
  await page.getByLabel('GitHub personal access token').fill('test-only-token');
  await page.getByRole('button', { name: 'Unlock my practice' }).click();
  await expect(page.getByTestId('reveal-answer-button')).toBeVisible();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByLabel('GitHub personal access token')).toBeVisible();
});

test('Easy persists rating 4 and undo removes its attempt and review', async ({ page }) => {
  await unlockFixture(page);
  await page.getByTestId('reveal-answer-button').click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await expect(page.getByText('11 left', { exact: true })).toBeVisible();
  expect(await storeRows(page, 'attempts')).toEqual([expect.objectContaining({ rating: 4, correct: true })]);
  expect(await storeRows(page, 'reviews')).toEqual([expect.objectContaining({ lastRating: 4 })]);
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.getByText('12 left', { exact: true })).toBeVisible();
  expect(await storeRows(page, 'attempts')).toHaveLength(0);
  expect(await storeRows(page, 'reviews')).toHaveLength(0);
});

test('service worker supports offline reload and retains a saved review', async ({ page, context }) => {
  await unlockFixture(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByTestId('reveal-answer-button').click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect(page.getByText('11 left', { exact: true })).toBeVisible();
  const before = await storeRows(page, 'reviews');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await storeRows(page, 'reviews')).toEqual(before);
});

test('focused session contains keyboard focus and Escape asks before ending', async ({ page }) => {
  await unlockFixture(page);
  await page.getByRole('button', { name: /Start daily practice/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Practice session', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
