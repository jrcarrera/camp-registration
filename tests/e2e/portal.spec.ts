import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('renders the linked parent family dashboard', async ({ page }) => {
  await page.goto('/portal');

  await expect(page.getByRole('heading', { level: 1, name: 'My Family' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Adams Family' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Alex Adams' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register for camp' })).toBeVisible();
});

test('renders parent checkout without a family selector', async ({ page }) => {
  await page.goto('/portal/register');

  await expect(page.getByRole('heading', { level: 1, name: 'Register for camp' })).toBeVisible();
  await expect(page.getByLabel('Household')).toContainText('Adams Family');
  await expect(page.getByLabel('Family account')).toHaveCount(0);
  await expect(page.getByLabel('Session')).toBeVisible();
  await expect(
    page.getByLabel('Registration checkout').getByRole('link', { name: 'My Family' }),
  ).toBeVisible();
});

test('redirects the legacy registration route into the parent portal', async ({ page }) => {
  await page.goto('/register');

  await expect(page).toHaveURL('/portal/register');
});
