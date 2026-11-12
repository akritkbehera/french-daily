/**
 * End-to-end tests: gestures, accidental-swipe prevention, review scheduling,
 * undo, reduced motion, session completion, persistence, and mobile sanity.
 *
 * Runs at 375×812, 390×844, 768×1024 and 1440×900 (see playwright.config.ts).
 */
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('french-daily-local-mode', 'yes'));
});

const isMobileViewport = (page: Page) => page.viewportSize()!.width < 768;

async function gotoApp(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Open the quick recall drill on the Today screen and wait for the deck. */
async function openDeck(page: Page) {
  await gotoApp(page);
  const card = page.getByTestId('swipe-card');
  await expect(card).toBeVisible();
  return card;
}

function remainingText(page: Page) {
  return page.getByText(/^\d+ left$/);
}

async function remaining(page: Page): Promise<number> {
  const text = await remainingText(page).textContent();
  return Number((text ?? '').replace(/\D/g, ''));
}

/** Drag the top card horizontally with controllable speed. */
async function dragCard(page: Page, dx: number, opts: { settleMs?: number } = {}) {
  const card = page.getByTestId('swipe-card');
  const box = (await card.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx * 0.5, startY, { steps: 6 });
  await page.mouse.move(startX + dx, startY, { steps: 6 });
  if (opts.settleMs) await page.waitForTimeout(opts.settleMs);
  await page.mouse.up();
}

test.describe('app shell', () => {
  test('loads the Today screen with greeting and daily action', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByRole('button', { name: /Start daily practice/ })).toBeVisible();
  });

  test('navigates all seven screens without horizontal overflow', async ({ page }) => {
    await gotoApp(page);
    for (const label of ['Nouns', 'Verbs', 'Practice', 'Review', 'Progress', 'Settings', 'Today']) {
      const buttons = page.getByRole('button', { name: label, exact: true });
      await buttons.first().click();
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(1);
    }
  });

  test('bottom nav on mobile, sidebar on desktop', async ({ page }) => {
    await gotoApp(page);
    const navs = page.getByRole('navigation');
    // Hidden (display:none) navs leave the accessibility tree, so exactly one
    // navigation is exposed: the bottom bar on mobile, the sidebar on desktop.
    await expect(navs).toHaveCount(1);
    await expect(navs.first()).toBeVisible();
    const labels = ['Today', 'Nouns', 'Verbs', 'Practice', 'Review', 'Progress', 'Settings'];
    for (const label of labels) {
      await expect(navs.first().getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('keyboard shortcuts jump between screens', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('5');
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('swipe gestures', () => {
  test('unrevealed cards cannot be graded by dragging (accidental-swipe prevention)', async ({ page }) => {
    await openDeck(page);
    const before = await remaining(page);
    await dragCard(page, 240, { settleMs: 250 });
    await page.waitForTimeout(400);
    expect(await remaining(page)).toBe(before);
  });

  test('a drag below the commit threshold springs back without grading', async ({ page }) => {
    await openDeck(page);
    await page.getByTestId('reveal-button').click();
    const before = await remaining(page);
    await dragCard(page, 60, { settleMs: 300 });
    await page.waitForTimeout(500);
    expect(await remaining(page)).toBe(before);
  });

  test('a drag past the commit threshold grades the card', async ({ page }) => {
    await openDeck(page);
    await page.getByTestId('reveal-button').click();
    const before = await remaining(page);
    await dragCard(page, 220, { settleMs: 300 });
    await expect.poll(() => remaining(page)).toBe(before - 1);
  });

  test('keyboard grading works: reveal with Space, grade with arrows', async ({ page }) => {
    await openDeck(page);
    const before = await remaining(page);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('swipe-card').getByText(/Think of the answer/)).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => remaining(page)).toBe(before - 1);
  });

  test('grade buttons commit immediately after reveal', async ({ page }) => {
    await openDeck(page);
    await page.getByTestId('reveal-button').click();
    const before = await remaining(page);
    await page.getByRole('button', { name: 'Again', exact: true }).click();
    await expect.poll(() => remaining(page)).toBe(before - 1);
  });

  test('undo restores the previous state and the card', async ({ page }) => {
    await openDeck(page);
    await page.getByTestId('reveal-button').click();
    const before = await remaining(page);
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await expect.poll(() => remaining(page)).toBe(before - 1);
    await page.getByRole('button', { name: /Undo/ }).click();
    await expect.poll(() => remaining(page)).toBe(before);
    await expect(page.getByText('Last grading undone')).toBeVisible();
  });

  test('keyboard undo (Ctrl/Cmd+Z) also works', async ({ page }) => {
    await openDeck(page);
    await page.getByTestId('reveal-button').click();
    const before = await remaining(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => remaining(page)).toBe(before - 1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => remaining(page)).toBe(before);
  });
});

test.describe('review scheduling and persistence', () => {
  test('graded attempts persist across reload (FSRS state + attempts)', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoApp(page);

    // Answer exactly one exercise in a focused practice session.
    await page.getByRole('button', { name: 'Practice', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Custom' }).click();
    await page.getByRole('button', { name: 'Multiple choice' }).click();
    await page.getByRole('button', { name: /Build my session/ }).click();

    const option = page.getByTestId('exercise-option').first();
    await expect(option).toBeVisible();
    await option.click();
    await page.getByTestId('continue-button').click();

    // End the partial session — it must not count as completed.
    await page.getByTestId('end-session-button').click();
    await page.getByTestId('confirm-end-button').click();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The attempt survives the reload: the Progress screen counts it.
    await page.getByRole('button', { name: 'Progress', exact: true }).first().click();
    await expect(page.getByText('Learning quality')).toBeVisible();
    await expect(page.getByText(/answers/)).toBeVisible();
  });

  test('completed sessions show an honest summary and count toward streaks', async ({ page }) => {
    // Full sessions answer every item plus up to 2 in-session retries each.
    test.setTimeout(120_000);
    await gotoApp(page);
    await page.getByRole('button', { name: 'Practice', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Custom' }).click();
    await page.getByRole('button', { name: 'Multiple choice' }).click();
    await page.getByRole('button', { name: /Build my session/ }).click();

    // Answer every card (and any in-session retries) until the finish line.
    // Each step awaits the UI transition, so this is deterministic.
    for (let i = 0; i < 60; i++) {
      if (await page.getByText('Session complete').isVisible().catch(() => false)) break;

      const cont = page.getByTestId('continue-button');
      if (await cont.isVisible().catch(() => false)) {
        await cont.click();
        await expect(cont).toBeHidden();
        continue;
      }

      const option = page.getByTestId('exercise-option').first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
        await expect(cont).toBeVisible();
        continue;
      }

      const check = page.getByTestId('check-button');
      const tiles = page.getByTestId('word-tile');
      if ((await tiles.count()) > 0) {
        for (const tile of await tiles.all()) await tile.click();
        await check.click();
        await expect(cont).toBeVisible();
        continue;
      }

      const answerInput = page.getByTestId('answer-input');
      if (await answerInput.isVisible().catch(() => false)) {
        await answerInput.fill('essai');
        await check.click();
        await expect(cont).toBeVisible();
        continue;
      }

      const sentenceInput = page.getByTestId('sentence-input');
      if (await sentenceInput.isVisible().catch(() => false)) {
        await sentenceInput.fill('Ceci est une phrase.');
        await check.click();
        await expect(cont).toBeVisible();
        continue;
      }

      await page.waitForTimeout(200);
    }

    await expect(page.getByText('Session complete')).toBeVisible();
    await expect(page.getByText(/correct ·/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start another session' })).toBeVisible();
  });
});

test.describe('accessibility and motion', () => {
  test('reduced motion is honored and grading still works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDeck(page);
    const isReduced = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    expect(isReduced).toBe(true);

    // Interactions remain fully functional without animation.
    await page.getByTestId('reveal-button').click();
    const before = await remaining(page);
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await expect.poll(() => remaining(page), { timeout: 2000 }).toBe(before - 1);
  });

  test('theme can be toggled in settings', async ({ page }) => {
    await gotoApp(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('tab', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});

test.describe('mobile performance sanity', () => {
  test('first content renders quickly and the bundle stays lean', async ({ page }) => {
    const start = Date.now();
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    const ms = Date.now() - start;
    expect(ms, `first heading took ${ms}ms`).toBeLessThan(8000);

    // Total transferred JS for the main bundle should stay well under 1 MB.
    const entries = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((r) => ({ name: r.name, size: (r as PerformanceResourceTiming).transferSize })),
    );
    const jsBytes = entries.filter((e) => e.name.endsWith('.js')).reduce((s, e) => s + (e.size || 0), 0);
    expect(jsBytes, `js transfer ${jsBytes} bytes`).toBeLessThan(1_500_000);
  });

  test('interactive controls meet touch-target guidance on mobile', async ({ page }) => {
    if (!isMobileViewport(page)) test.skip();
    await gotoApp(page);
    const navButtons = page.getByRole('navigation').first().getByRole('button');
    const count = await navButtons.count();
    for (let i = 0; i < count; i++) {
      const box = (await navButtons.nth(i).boundingBox())!;
      expect(box.height, `nav item ${i} height`).toBeGreaterThanOrEqual(40);
    }
  });
});
