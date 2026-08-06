import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('manages an operational profile and assignment without exposing staff roster contact data', async ({
  page,
  request,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const sessions = (await (await request.get('/api/v1/sessions')).json()) as {
    sessions: Array<{ ends_on: string; id: string; starts_on: string }>;
  };
  const session = sessions.sessions.find((candidate) => candidate.starts_on >= '2027-01-01');
  expect(session).toBeTruthy();
  const token = `workforce-${testInfo.project.name}-${Date.now()}`;

  await page.goto('/workforce');
  await expect(page.getByRole('heading', { level: 1, name: 'Workforce' })).toBeVisible();
  await page.getByLabel('first name').fill('E2E');
  await page.getByLabel('last name').fill(token);
  await page.getByLabel('email').fill(`${token}@example.test`);
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByText('Workforce profile created.')).toBeVisible();

  await page.getByLabel('Session').last().selectOption(session!.id);
  await page.getByLabel('Position').fill('Counselor');
  await page.getByLabel('Starts').fill(session!.starts_on);
  await page.getByLabel('Ends').fill(session!.ends_on);
  await page.getByRole('button', { name: 'Add assignment' }).click();
  await expect(page.getByText('Session assignment saved.')).toBeVisible();
  await page.locator('button[aria-label^="Edit Counselor assignment"]').click();
  await page.getByLabel('Position').fill('Lead counselor');
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(page.getByText('Session assignment updated.')).toBeVisible();
  await page.locator('button[aria-label^="Cancel Lead counselor assignment"]').click();
  await expect(page.getByText('Assignment cancelled; the history is retained.')).toBeVisible();

  const roster = await request.get(`/api/v1/sessions/${session!.id}/workforce-roster`, {
    headers: {
      'x-local-actor-id': 'e2e-camp-staff',
      'x-local-email': 'staff@example.test',
      'x-local-email-verified': 'true',
      'x-local-roles': 'camp_staff',
    },
  });
  expect(roster.status()).toBe(200);
  expect(roster.headers()['cache-control']).toBe('private, no-store');
  const rosterBody = JSON.stringify(await roster.json());
  expect(rosterBody).not.toContain(`${token}@example.test`);
  expect(rosterBody).not.toContain('account_id');

  await page.goto('/workforce/roster');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Session workforce roster' }),
  ).toBeVisible();
  await page.setViewportSize({ height: 844, width: 320 });
  await expect(page.getByLabel('Session')).toBeVisible();
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(browserErrors).toEqual([]);
});

test('denies Workforce administration without an MFA-verified administrator', async ({
  request,
}) => {
  for (const [actor, role, mfa] of [
    ['e2e-parent', 'parent_guardian', 'true'],
    ['e2e-camp-staff', 'camp_staff', 'true'],
    ['e2e-health-staff', 'health_staff', 'true'],
    ['e2e-finance-staff', 'finance_staff', 'true'],
    ['e2e-camp-admin', 'camp_admin', 'false'],
  ]) {
    const response = await request.get('/api/v1/workforce', {
      headers: {
        'x-local-actor-id': actor,
        'x-local-email': `${actor}@example.test`,
        'x-local-email-verified': 'true',
        'x-local-mfa-verified': mfa,
        'x-local-roles': role,
      },
    });
    expect(response.status()).toBe(403);
    expect(response.headers()['cache-control']).toBe('private, no-store');
  }
});
