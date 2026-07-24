import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('shows the finance adjustment workspace on desktop and mobile', async ({ page }) => {
  await page.goto('/payments');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Payments and adjustments' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Record an adjustment' })).toBeVisible();
  await expect(page.getByLabel('Registration account')).toBeVisible();
  await expect(page.getByRole('combobox', { exact: true, name: 'Adjustment' })).toHaveValue(
    'CREDIT',
  );
  await expect(page.getByText('Every change requires a reason and is audited.')).toBeVisible();

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(page.getByLabel('Registration account')).toBeVisible();
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
});

test('denies ordinary camp staff access to finance adjustments', async ({ request }) => {
  const response = await request.get('/api/v1/payment-adjustments', {
    headers: {
      'x-local-actor-id': 'e2e-camp-staff',
      'x-local-email': 'staff@example.test',
      'x-local-email-verified': 'true',
      'x-local-roles': 'camp_staff',
    },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ code: 'forbidden' });
});
