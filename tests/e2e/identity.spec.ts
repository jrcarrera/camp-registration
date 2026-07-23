import { expect, request as playwrightRequest, test } from '@playwright/test';

test('organization signup remains status-only until administrator approval', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name.replace(/[^a-z0-9]+/gi, '.').toLowerCase();
  const email = `identity.${suffix}.${Date.now()}@example.test`;

  await page.goto('/o/test-camp/join');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByRole('button', { name: 'Request family account' })).toBeVisible();
  await page.getByLabel('First name').fill('Identity');
  await page.getByLabel('Last name').fill(`Applicant ${suffix}`);
  await page.getByRole('button', { name: 'Request family account' }).click();
  await expect(page.getByRole('heading', { name: 'Request awaiting review' })).toBeVisible();

  const forbidden = await page.request.get('/api/v1/catalog');
  expect(forbidden.status()).toBe(403);

  const administrator = await playwrightRequest.newContext({
    baseURL: 'http://127.0.0.1:3001',
  });
  const center = await administrator.get('/v1/identity/administration');
  expect(center.ok()).toBeTruthy();
  const body = (await center.json()) as {
    onboarding_requests: Array<{ email: string; id: string }>;
  };
  const onboarding = body.onboarding_requests.find((request) => request.email === email);
  expect(onboarding).toBeTruthy();
  const approval = await administrator.post(`/v1/identity/onboarding/${onboarding!.id}/decision`, {
    data: { action: 'APPROVE_NEW' },
  });
  expect(approval.ok()).toBeTruthy();
  await administrator.dispose();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Family account approved' })).toBeVisible();
  await page.getByRole('link', { name: 'Open parent portal' }).click();
  await expect(page.getByRole('heading', { name: `Applicant ${suffix} Family` })).toBeVisible();

  const changedEmail = `changed.${email}`;
  await page.goto('/account/security');
  await page.getByLabel('New email address').fill(changedEmail);
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await page.getByLabel('Verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify new email' }).click();
  await expect(page.getByText(changedEmail, { exact: true })).toBeVisible();
});
