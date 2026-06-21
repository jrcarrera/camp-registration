import { expect, test } from '@playwright/test';

test('renders the operations dashboard foundation', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Camp Registration' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Local system ready');
  await expect(page.getByText('No sessions yet')).toBeVisible();
});

test('keeps the responsive empty state readable', async ({ page }) => {
  await page.goto('/');

  const layout = await page.evaluate(() => {
    const emptyState = document.querySelector<HTMLElement>('.emptyState');
    const frame = document.querySelector<HTMLElement>('.tableFrame');

    if (!emptyState || !frame) {
      return { contained: false, horizontalOverflow: true };
    }

    const emptyRect = emptyState.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    return {
      contained: emptyRect.left >= frameRect.left && emptyRect.right <= frameRect.right,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  expect(layout).toEqual({ contained: true, horizontalOverflow: false });
});
