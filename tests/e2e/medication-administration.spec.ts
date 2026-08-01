import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('runs an encrypted medication round on desktop and mobile', async ({
  page,
  request,
}, testInfo) => {
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

  const medicationName = `E2E round medication ${testInfo.project.name}`;
  await page.goto('/medication-administration');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Medication administration' }),
  ).toBeVisible();

  await page.getByLabel('Camper and session').selectOption({ index: 1 });
  await page.getByLabel('Medication', { exact: true }).fill(medicationName);
  await page.getByLabel('Dose').fill('5 mg');
  await page.getByLabel('Instructions').fill('Give with water during the E2E round.');
  await page.getByLabel('Administration time 1').fill('08:00');
  await page.getByRole('button', { name: 'Add medication order' }).click();

  await expect(page.getByText('Medication order added to the restricted round.')).toBeVisible();
  const scheduledCard = page
    .locator('.medicationDoseCard')
    .filter({ hasText: medicationName })
    .first();
  await expect(scheduledCard).toBeVisible();
  await scheduledCard.getByRole('button', { name: 'Record dose' }).click();
  await page.getByRole('button', { name: 'Record administration' }).click();

  await expect(
    page.getByText('Medication administration appended to the permanent round history.'),
  ).toBeVisible();
  await expect(
    page.locator('.medicationHistory article').filter({ hasText: medicationName }),
  ).toContainText('given');

  const date = await page.getByLabel('Round date').inputValue();
  const centerResponse = await request.get(
    `/api/v1/medication-administration?${new URLSearchParams({ date })}`,
  );
  expect(centerResponse.status()).toBe(200);
  const center = (await centerResponse.json()) as {
    orders: Array<{ id: string; medication_name: string }>;
    scheduled_doses: Array<{
      administration: unknown;
      order_id: string;
      scheduled_for: string;
    }>;
  };
  const order = center.orders.find((candidate) => candidate.medication_name === medicationName);
  expect(order).toBeTruthy();
  const dose = center.scheduled_doses.find((candidate) => candidate.order_id === order!.id);
  expect(dose?.administration).toBeTruthy();
  const duplicate = await request.post(
    `/api/v1/medication-administration/orders/${order!.id}/administrations`,
    {
      data: {
        administered_at: new Date().toISOString(),
        note: '',
        outcome: 'GIVEN',
        scheduled_for: dose!.scheduled_for,
      },
    },
  );
  expect(duplicate.status()).toBe(409);

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(page.getByRole('heading', { level: 2, name: 'Medication round' })).toBeVisible();
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(browserErrors).toEqual([]);
});

test('denies medication rounds without an authorized role and MFA', async ({ request }) => {
  const ordinaryStaff = await request.get('/api/v1/medication-administration', {
    headers: {
      'x-local-actor-id': 'e2e-camp-staff',
      'x-local-email': 'staff@example.test',
      'x-local-email-verified': 'true',
      'x-local-roles': 'camp_staff',
    },
  });
  const missingMfa = await request.get('/api/v1/medication-administration', {
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
