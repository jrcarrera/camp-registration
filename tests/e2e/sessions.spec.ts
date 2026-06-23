import { expect, test, type Page } from '@playwright/test';

test('renders the API-backed dashboard and session catalog', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Camp Registration' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Local system ready');
  await expect(page.getByText('Published sessions')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Day Camp Week 1 Day Camp · DAY-2027-01' }),
  ).toBeVisible();

  await page.getByRole('link', { exact: true, name: 'Sessions' }).click();
  await expect(page).toHaveURL('/sessions');
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

  await page.goto('/sessions/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Create session' })).toBeVisible();
  await expect(page.getByLabel('Session code', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { exact: true, name: 'Season' })).toHaveValue(
    'd5d8a8b7-c4ff-43be-a849-60cbd5914c85',
  );
  await expect(page.getByRole('button', { exact: true, name: 'Create session' })).toBeDisabled();
});

test('keeps session management within the mobile viewport', async ({ page }) => {
  await page.goto('/sessions');

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

test('edits and restores a camp week', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One project owns the persisted edit.');

  await page.goto('/sessions/28933fbb-470e-4ad6-9a74-600efe4232e3');
  const name = page.getByLabel('Session name', { exact: true });
  const save = page.getByRole('button', { exact: true, name: 'Save changes' });
  const originalName = await name.inputValue();

  try {
    await name.fill(`${originalName} - E2E`);
    await save.click();
    await expect(page.getByText('Session changes saved.')).toBeVisible();
    await expect(page.locator('.dirtyIndicator')).toContainText('Version');
  } finally {
    if ((await name.inputValue()) !== originalName) {
      await name.fill(originalName);
      await save.click();
      await expect(page.getByText('Session changes saved.')).toBeVisible();
    }
  }
});

test('updates scheduled inventory when a status changes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One project owns the persisted edit.');

  const sessionUrl = '/sessions/7defa0f5-582e-4c25-a750-f29ba243f618';
  await page.goto('/sessions');
  const initialSummary = await summaryValues(page);
  await page.goto(sessionUrl);
  const status = page.getByRole('combobox', { exact: true, name: 'Status' });
  const save = page.getByRole('button', { exact: true, name: 'Save changes' });
  const originalStatus = await status.inputValue();

  try {
    await status.selectOption('CANCELLED');
    await save.click();
    await expect(page.getByText('Session changes saved.')).toBeVisible();
    await page.locator('main').getByRole('link', { exact: true, name: 'Sessions' }).click();
    await expect(page.locator('.listSummary strong')).toHaveText(
      `${initialSummary.weeks - 1} scheduled weeks`,
    );
    await expect(page.locator('.listSummary')).toContainText(
      `${initialSummary.spaces - 120} scheduled spaces`,
    );
  } finally {
    await page.goto(sessionUrl);
    if ((await status.inputValue()) !== originalStatus) {
      await status.selectOption(originalStatus);
      await save.click();
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
