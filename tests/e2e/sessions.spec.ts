import { expect, test, type Page } from '@playwright/test';

import { waitForApiReady } from './support';

const summer2027SeasonId = 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85';

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('renders the API-backed dashboard and session catalog', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Camp Registration' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Waitlist operations' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Notification issues' })).toBeVisible();
  await expect(page.getByText('No notification issues require staff action.')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Local system ready');
  await expect(page.getByRole('heading', { level: 2, name: 'Sessions' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Day Camp Week 1(?: - E2E)? Day Camp · DAY-2027-01/ }),
  ).toBeVisible();

  const dashboardLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dashboardLayout.horizontalOverflow).toBe(false);

  await page.getByRole('link', { exact: true, name: 'Sessions' }).click();
  await expect(page).toHaveURL('/sessions');
  await page.goto(`/sessions?seasonId=${summer2027SeasonId}`);
  await expect(page.locator('.listSummary')).toContainText('scheduled weeks');
  expect(await page.locator('.sessionsTable tbody tr').count()).toBeGreaterThanOrEqual(9);
});

test('opens API-backed catalog creation forms', async ({ page }) => {
  await page.goto('/seasons');
  await expect(page.getByRole('heading', { level: 1, name: 'Seasons' })).toBeVisible();
  expect(await page.locator('.seasonsTable tbody tr').count()).toBeGreaterThanOrEqual(1);

  await page.getByRole('link', { exact: true, name: 'Add season' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create season' })).toBeVisible();
  await expect(page.getByLabel('Season name', { exact: true })).toBeVisible();

  await page.goto('/programs');
  await expect(page.getByRole('heading', { level: 1, name: 'Programs' })).toBeVisible();
  expect(await page.locator('.programsTable tbody tr').count()).toBeGreaterThanOrEqual(4);

  await page.getByRole('link', { exact: true, name: 'Add program' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create program' })).toBeVisible();
  await expect(page.getByLabel('Program code', { exact: true })).toBeVisible();

  await page.goto(`/sessions/new?seasonId=${summer2027SeasonId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Create session' })).toBeVisible();
  await expect(page.getByLabel('Session code', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { exact: true, name: 'Season' })).toHaveValue(
    summer2027SeasonId,
  );
  await expect(page.getByRole('button', { exact: true, name: 'Create session' })).toBeDisabled();
});

test('renders tenant-owned waitlist offer policy settings', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Waitlist offer policy' }),
  ).toBeVisible();
  const claimWindow = page.getByRole('combobox', {
    exact: true,
    name: 'Default claim window',
  });
  expect(['24', '48', '72', '168']).toContain(await claimWindow.inputValue());
  await expect(page.getByRole('button', { exact: true, name: 'Save settings' })).toBeDisabled();

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
});

test('keeps session management within the mobile viewport', async ({ page }) => {
  await page.goto(`/sessions?seasonId=${summer2027SeasonId}`);

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(layout).toEqual({
    documentWidth: layout.viewportWidth,
    horizontalOverflow: false,
    viewportWidth: layout.viewportWidth,
  });
});

test('offers responsive operational report presets', async ({ page }) => {
  await page.goto('/reports');

  await expect(page.getByRole('heading', { level: 1, name: 'Reports and exports' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Build an operational report' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Cross-session roster/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
    'href',
    /preset=SESSION_ROSTER/,
  );

  await page.getByRole('button', { name: /Form readiness/ }).click();
  await page.getByRole('combobox', { name: 'Output' }).selectOption('XLSX');
  await expect(page.getByRole('link', { name: 'Download XLSX' })).toHaveAttribute(
    'href',
    /preset=READINESS/,
  );
  await page.getByRole('button', { name: 'Preview report' }).click();
  await expect(page.getByText(/report rows currently match/)).toBeVisible();

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
});

test('offers a responsive lifecycle communications workspace', async ({ page }) => {
  await page.goto('/communications');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Lifecycle communications' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Message templates' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Schedule a communication' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview recipients' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
});

test('edits and restores a camp week', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One project owns the persisted edit.');
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto('/sessions/28933fbb-470e-4ad6-9a74-600efe4232e3');
  const name = page.getByLabel('Session name', { exact: true });
  const season = page.getByRole('combobox', { exact: true, name: 'Season' });
  const save = page.getByRole('button', { exact: true, name: 'Save changes' });
  const originalName = await name.inputValue();
  await expect(season).toHaveValue('d5d8a8b7-c4ff-43be-a849-60cbd5914c85');

  try {
    await name.fill(`${originalName} - E2E`);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Session changes saved.')).toBeVisible();
    await expect(page.locator('.dirtyIndicator')).toContainText('Version');
  } finally {
    const restoreName = page.getByLabel('Session name', { exact: true });
    const restoreSave = page.getByRole('button', { exact: true, name: 'Save changes' });
    if ((await restoreName.inputValue()) !== originalName) {
      await restoreName.fill(originalName);
      await expect(restoreSave).toBeEnabled();
      await restoreSave.click();
      await expect(page.getByText('Session changes saved.')).toBeVisible();
    }
  }
});

test('updates scheduled inventory when a status changes', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One project owns the persisted edit.');
  page.on('dialog', (dialog) => void dialog.accept());

  const sessionUrl = '/sessions/7defa0f5-582e-4c25-a750-f29ba243f618';
  await page.goto(`/sessions?seasonId=${summer2027SeasonId}`);
  const initialSummary = await summaryValues(page);
  await page.goto(sessionUrl);
  const status = page.getByRole('combobox', { exact: true, name: 'Status' });
  const save = page.getByRole('button', { exact: true, name: 'Save changes' });
  const originalStatus = await status.inputValue();
  const targetStatus = originalStatus === 'CANCELLED' ? 'PUBLISHED' : 'CANCELLED';
  const expectedWeekDelta = targetStatus === 'CANCELLED' ? -1 : 1;
  const expectedSpaceDelta = targetStatus === 'CANCELLED' ? -120 : 120;

  try {
    await status.selectOption(targetStatus);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Session changes saved.')).toBeVisible();
    await page.goto(`/sessions?seasonId=${summer2027SeasonId}`);
    await expect(page.locator('.listSummary strong')).toHaveText(
      `${initialSummary.weeks + expectedWeekDelta} scheduled weeks`,
    );
    await expect(page.locator('.listSummary')).toContainText(
      `${initialSummary.spaces + expectedSpaceDelta} scheduled spaces`,
    );
  } finally {
    await page.goto(sessionUrl);
    const restoreStatus = page.getByRole('combobox', { exact: true, name: 'Status' });
    const restoreSave = page.getByRole('button', { exact: true, name: 'Save changes' });
    if ((await restoreStatus.inputValue()) !== originalStatus) {
      await restoreStatus.selectOption(originalStatus);
      await expect(restoreSave).toBeEnabled();
      await restoreSave.click();
      await expect(page.getByText('Session changes saved.')).toBeVisible();
    }
  }
});

async function summaryValues(page: Page) {
  const summary = await page.locator('.listSummary').innerText();
  const weeks = Number(summary.match(/(\d+) scheduled weeks/)?.[1]);
  const spaces = Number(summary.match(/(\d+) scheduled spaces/)?.[1]);
  if (!Number.isFinite(weeks) || !Number.isFinite(spaces)) {
    throw new Error(`Could not parse session summary: ${summary}`);
  }
  return { spaces, weeks };
}
