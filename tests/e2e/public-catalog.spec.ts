import { expect, test, type APIRequestContext } from '@playwright/test';

import { waitForApiReady } from './support';

const settings = {
  brand_logo_url: null,
  brand_primary_color: '#166534',
  public_catalog_enabled: true,
  public_contact_email: 'catalog@example.test',
  public_description: 'A fictional catalog used only for browser verification.',
  public_tagline: 'A summer outside',
  public_website_url: 'https://example.test',
  self_service_signup_enabled: true,
  stripe_connected_account_id: null,
  waitlist_offer_duration_hours: 48,
};

async function updateCatalogSettings(request: APIRequestContext, publicCatalogEnabled: boolean) {
  const response = await request.patch('/api/v1/organization/settings', {
    data: { ...settings, public_catalog_enabled: publicCatalogEnabled },
  });
  expect(response.status()).toBe(200);
}

test.beforeEach(async ({ request }) => {
  await waitForApiReady(request);
});

test('renders and filters the public catalog on desktop and mobile without exposing private fields', async ({
  page,
  request,
}) => {
  await updateCatalogSettings(request, true);
  try {
    const publicResponse = await request.get(
      'http://127.0.0.1:3001/v1/public/organizations/test-camp/catalog',
    );
    expect(publicResponse.status()).toBe(200);
    expect(publicResponse.headers()['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const serialized = JSON.stringify(await publicResponse.json());
    expect(serialized).not.toContain('organization_id');
    expect(serialized).not.toContain('registered_count');
    expect(serialized).not.toContain('waitlisted_count');

    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) browserErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto('/o/test-camp');
    await expect(page.getByRole('heading', { level: 1, name: 'Test Camp' })).toBeVisible();
    await expect(page.getByText('A summer outside')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a family account' })).toHaveAttribute(
      'href',
      '/o/test-camp/join',
    );
    await page.getByLabel('Season').selectOption('2027');
    await expect(page.getByText('2027 · Day Camp').first()).toBeVisible();
    await page.getByLabel('Search sessions').fill('not a real session');
    await expect(page.getByText('No sessions match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.getByText(/session(s)? shown/)).toBeVisible();

    await page.setViewportSize({ height: 844, width: 320 });
    await expect(page.getByLabel('Season')).toBeVisible();
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(browserErrors).toEqual([]);
  } finally {
    await updateCatalogSettings(request, false);
  }
});

test('returns a public indistinguishable not-found response when publication is disabled', async ({
  page,
  request,
}) => {
  await updateCatalogSettings(request, false);
  const response = await request.get(
    'http://127.0.0.1:3001/v1/public/organizations/test-camp/catalog',
  );
  expect(response.status()).toBe(404);
  expect(response.headers()['cache-control']).toBe('no-store');

  await page.goto('/o/test-camp');
  await expect(page.getByText('404')).toBeVisible();
});
