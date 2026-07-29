import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('records, follows up, and resolves an encrypted incident on desktop and mobile', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(`${message.text()} @ ${message.location().url}`);
    }
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto('/health-incidents');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Incident and injury log' }),
  ).toBeVisible();
  await page.getByLabel('Camper and session').selectOption({ index: 1 });
  await page.getByLabel('Occurred at').fill('2020-01-02T03:04');
  await page.getByLabel('Incident type').selectOption('INJURY');
  await page.getByLabel('Severity').selectOption('MINOR');
  await page.getByLabel('Location').fill('E2E activity field');
  await page.getByLabel('What happened').fill('E2E camper tripped without serious injury.');
  await page.getByLabel('Care or immediate action').fill('Rest and water were provided.');
  await page.getByRole('button', { name: 'Record incident' }).click();

  await expect(page.getByText('Incident recorded in the restricted log.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'What happened' })).toBeVisible();
  await expect(page.getByText('E2E camper tripped without serious injury.')).toBeVisible();

  await page.getByLabel('Guardian notified', { exact: true }).fill('E2E Guardian');
  await page.getByLabel('Guardian notified at', { exact: true }).fill('2020-01-02T03:15');
  await page.getByLabel('Notification note').fill('Reached by phone.');
  await page.getByRole('button', { name: 'Record notification' }).click();
  await expect(
    page.getByText('Guardian notification appended to the incident timeline.'),
  ).toBeVisible();
  await expect(page.getByRole('listitem').getByText(/E2E Guardian/)).toBeVisible();

  await page.getByLabel('Follow-up note').fill('Camper returned to the group after ten minutes.');
  await page.getByRole('button', { name: 'Add follow-up' }).click();
  await expect(page.getByText('Follow-up note appended.')).toBeVisible();
  await expect(page.getByText('Camper returned to the group after ten minutes.')).toBeVisible();

  await page.getByLabel('Resolution').fill('No further care was needed.');
  await page.getByRole('button', { name: 'Resolve incident' }).click();
  await expect(
    page.getByText('Incident resolved with an append-only resolution entry.'),
  ).toBeVisible();
  await expect(page.getByText('No further care was needed.')).toBeVisible();

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(page.getByRole('heading', { level: 2, name: 'Incident log' })).toBeVisible();
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(browserErrors).toEqual([]);
});

test('denies incident access without an authorized role and MFA', async ({ request }) => {
  const ordinaryStaff = await request.get('/api/v1/health-incidents', {
    headers: {
      'x-local-actor-id': 'e2e-camp-staff',
      'x-local-email': 'staff@example.test',
      'x-local-email-verified': 'true',
      'x-local-roles': 'camp_staff',
    },
  });
  const missingMfa = await request.get('/api/v1/health-incidents', {
    headers: {
      'x-local-actor-id': 'e2e-health-staff',
      'x-local-email': 'health@example.test',
      'x-local-email-verified': 'true',
      'x-local-mfa-verified': 'false',
      'x-local-roles': 'health_staff',
    },
  });

  expect(ordinaryStaff.status()).toBe(403);
  expect(missingMfa.status()).toBe(403);
});
