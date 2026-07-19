import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('shows session housing without horizontal overflow', async ({ page }) => {
  await page.goto('/housing');

  await expect(page.getByRole('heading', { level: 1, name: 'Camper housing' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Buildings and beds' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Session assignments' })).toBeVisible();
  await expect(page.getByLabel('Building name', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { exact: true, name: 'Balance across buildings' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { exact: true, name: 'Fill and close extras' }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Age NaN');

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.documentWidth).toBe(layout.viewportWidth);
});

test('captures bunk buddy requests in the parent cart', async ({ page }) => {
  await page.goto('/portal/register');

  await expect(page.getByText('Bunk buddies', { exact: false })).toBeVisible();
  await expect(page.getByText('placement is not guaranteed', { exact: false })).toBeVisible();
});
