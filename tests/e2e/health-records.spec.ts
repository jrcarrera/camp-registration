import { expect, test } from '@playwright/test';

import { waitForApiReady } from './support';

const parentHeaders = {
  'x-local-actor-id': 'local-parent-avery',
  'x-local-email': 'winter.family001.adult1@example.test',
  'x-local-email-verified': 'true',
  'x-local-roles': 'parent_guardian',
};

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('completes the encrypted parent submission and staff review workflow', async ({
  page,
  request,
}) => {
  const centerResponse = await request.get('/api/v1/health-records', {
    headers: parentHeaders,
  });
  expect(centerResponse.ok(), await centerResponse.text()).toBeTruthy();
  const center = (await centerResponse.json()) as {
    records: Array<{ camper_id: string; camper_name: string; record_id: string | null }>;
  };
  const camper = center.records.find((record) => record.camper_name === 'Alex Adams');
  expect(camper).toBeTruthy();

  const currentResponse = await request.get(`/api/v1/health-records/campers/${camper!.camper_id}`, {
    headers: parentHeaders,
  });
  const current = currentResponse.ok()
    ? ((await currentResponse.json()) as { version: number })
    : null;
  const saveResponse = await request.put(`/api/v1/health-records/campers/${camper!.camper_id}`, {
    data: {
      accessibility_needs: [],
      allergies: ['Peanuts'],
      dietary_needs: [],
      document_references: [
        {
          label: 'Emergency plan',
          storage_reference: 'private/health/e2e-emergency-plan',
          type: 'CARE_PLAN',
        },
      ],
      emergency_instructions: 'Follow the documented emergency action plan.',
      immunization_notes: '',
      immunization_status: 'CURRENT',
      medications: ['Epinephrine auto-injector'],
      ...(current ? { version: current.version } : {}),
    },
    headers: parentHeaders,
  });
  expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();

  await page.goto('/portal/health');
  await page.getByLabel('Find a camper').fill('Alex Adams');
  await page.getByRole('button', { name: /Alex Adams Adams Family/ }).click();
  await expect(page.getByLabel('Allergies')).toHaveValue('Peanuts');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Health record submitted for pre-arrival review.')).toBeVisible();

  await page.goto('/health-records');
  await page.getByLabel('Find a camper').fill('Alex Adams');
  await page.getByRole('button', { name: /Alex Adams Adams Family/ }).click();
  await page.getByLabel('Parent-facing review message').fill('Reviewed and ready for camp.');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Health record approved.')).toBeVisible();

  await page.goto('/portal/health');
  await page.getByLabel('Find a camper').fill('Alex Adams');
  await page.getByRole('button', { name: /Alex Adams Adams Family/ }).click();
  await expect(page.getByText('Reviewed and ready for camp.')).toBeVisible();
  await expect(page.getByText('Restricted health data')).toBeVisible();

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
});
