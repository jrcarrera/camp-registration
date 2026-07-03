import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

const adamsFamilyId = 'dfd272a5-42df-5813-a7db-664d7a82f664';
const elementarySessionId = '8945ea22-2659-4a13-9e70-ec4f2cbcbf9d';
const parentHeaders = {
  'x-local-actor-id': 'local-parent-avery',
  'x-local-email': 'winter.family001.adult1@example.test',
  'x-local-email-verified': 'true',
  'x-local-roles': 'parent_guardian',
};

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('renders the linked parent family dashboard', async ({ page }) => {
  await page.goto('/portal');

  await expect(page.getByRole('heading', { level: 1, name: 'My Family' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Adams Family' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Alex Adams' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Camp plan' })).toBeVisible();
  await expect(page.getByText('Primary household contact')).toBeVisible();
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

test('lets parents cancel a registration from the camp plan', async ({ page, request }) => {
  const suffix = Date.now().toString(36);
  const firstName = `Portal`;
  const lastName = `Cancel${suffix}`;
  const camperName = `${firstName} ${lastName}`;
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2015-02-01',
        first_name: firstName,
        gender: 'Female',
        last_name: lastName,
        school_grade: '5',
      },
      session_id: elementarySessionId,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok()).toBeTruthy();

  await page.goto('/portal');
  const planItem = page.getByLabel(`Elementary Boys & Girls for ${camperName}`);
  await expect(planItem).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await planItem.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('status')).toContainText(
    `Elementary Boys & Girls registration cancelled for ${camperName}.`,
  );
  await expect(planItem).toBeHidden();
});
