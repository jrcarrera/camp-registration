import { expect, test, type APIRequestContext } from '@playwright/test';

import { waitForApiReady } from './support';

const adamsFamilyId = 'dfd272a5-42df-5813-a7db-664d7a82f664';
const elementaryProgramId = '1c9d3031-9923-43ba-909f-1887f99460bb';
const portalTestSeasonId = 'fc94ef27-1fa6-466b-b877-312c27d00a7c';
const parentHeaders = {
  'x-local-actor-id': 'local-parent-avery',
  'x-local-email': 'winter.family001.adult1@example.test',
  'x-local-email-verified': 'true',
  'x-local-roles': 'parent_guardian',
};

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createPortalTestSession(
  request: APIRequestContext,
  suffix: string,
  label: string,
): Promise<{ id: string; name: string }> {
  const code = `E2E-${label}-${suffix}`.toUpperCase();
  const name = `E2E ${label} ${suffix}`;
  const response = await request.post('/api/v1/sessions', {
    data: {
      code,
      ends_on: '2027-06-26',
      name,
      program_id: elementaryProgramId,
      registration_closes_at: '2027-06-17T05:00:00Z',
      registration_opens_at: '2026-01-15T15:00:00Z',
      season_id: portalTestSeasonId,
      starts_on: '2027-06-20',
      status: 'PUBLISHED',
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const session = (await response.json()) as { id: string; name: string };
  return { id: session.id, name: session.name };
}

async function createCapacityOneSession(
  request: APIRequestContext,
  suffix: string,
): Promise<{ id: string; name: string }> {
  const programResponse = await request.post('/api/v1/programs', {
    data: {
      code: `E2E-WAIT-${suffix}`.toUpperCase(),
      default_age_as_of: 'SESSION_START',
      default_capacity: 1,
      default_deposit_cents: 5000,
      default_maximum_age: 12,
      default_maximum_grade: 5,
      default_minimum_age: 6,
      default_minimum_grade: 1,
      default_price_cents: 25000,
      default_waitlist_enabled: true,
      delivery_mode: 'DAY',
      description: 'Capacity-one waitlist offer browser test.',
      name: `E2E Waitlist Program ${suffix}`,
    },
  });
  expect(programResponse.ok(), await programResponse.text()).toBeTruthy();
  const program = (await programResponse.json()) as { id: string };
  const response = await request.post('/api/v1/sessions', {
    data: {
      code: `E2E-WAIT-SESSION-${suffix}`.toUpperCase(),
      ends_on: '2027-06-26',
      name: `E2E Waitlist Session ${suffix}`,
      program_id: program.id,
      registration_closes_at: '2027-06-17T05:00:00Z',
      registration_opens_at: '2026-01-15T15:00:00Z',
      season_id: portalTestSeasonId,
      starts_on: '2027-06-20',
      status: 'PUBLISHED',
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const session = (await response.json()) as { id: string; name: string };
  return session;
}

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

test('lets parents complete camp readiness details', async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const session = await createPortalTestSession(request, suffix, 'READY');
  const firstName = 'Ready';
  const lastName = `Camper${suffix}`;
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: firstName,
        gender: 'Female',
        last_name: lastName,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok()).toBeTruthy();
  const result = (await checkout.json()) as {
    family: {
      campers: Array<{ first_name: string; id: string; last_name: string }>;
    };
    registration: { status: string };
  };
  expect(result.registration.status).toBe('CONFIRMED');
  const camper = result.family.campers.find(
    (candidate) => candidate.first_name === firstName && candidate.last_name === lastName,
  );
  expect(camper).toBeDefined();
  const createdCamper = camper as {
    first_name: string;
    id: string;
    last_name: string;
  };
  const note = `No health concerns for readiness ${uniqueSuffix()}`;

  await page.goto('/portal/readiness');

  await expect(page.getByRole('heading', { level: 1, name: 'Camp readiness' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Readiness' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const camperCard = page.getByTestId(`camper-readiness-${createdCamper.id}`);
  await expect(camperCard).toBeVisible();
  await camperCard.getByLabel('School grade').fill('5');
  await camperCard.getByLabel('Gender').selectOption('Female');
  await camperCard.getByLabel('Health, allergies, medication, or accessibility notes').fill(note);
  await camperCard.getByRole('button', { name: 'Save readiness' }).click();

  await expect(page.getByRole('status')).toContainText(
    `${createdCamper.first_name} ${createdCamper.last_name} readiness details saved.`,
  );
  await expect(
    camperCard.getByText('Health, allergy, medication, or accessibility notes reviewed'),
  ).toBeVisible();
});

test('lets parents add emergency and pickup contacts from readiness', async ({ page }) => {
  const suffix = uniqueSuffix();
  const firstName = 'Pickup';
  const lastName = `Ready${suffix}`;

  await page.goto('/portal/readiness');

  const contactForm = page.getByTestId(`contact-editor-new-${adamsFamilyId}`);
  await contactForm.getByLabel('First name').fill(firstName);
  await contactForm.getByLabel('Last name').fill(lastName);
  await contactForm.getByLabel('Phone').fill('555-0123');
  await contactForm.getByLabel('Email').fill(`pickup.${suffix}@example.test`);
  await contactForm.getByLabel('Relationship').fill('Neighbor');
  await contactForm.getByLabel('Emergency priority').fill('2');
  await contactForm.getByRole('button', { name: 'Add contact' }).click();

  await expect(page.getByRole('status')).toContainText('Contact added.');
  await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible();
});

test('lets staff record an offline payment for a parent registration', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const session = await createPortalTestSession(request, suffix, 'PAY');
  const firstName = 'Pay';
  const lastName = `Balance${suffix}`;
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: firstName,
        gender: 'Female',
        last_name: lastName,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok()).toBeTruthy();
  const result = (await checkout.json()) as {
    registration: { balance_due_cents: number; deposit_cents: number; registration_id: string };
  };

  await page.goto(`/sessions/${session.id}`);

  const paymentForm = page.getByTestId(`payment-form-${result.registration.registration_id}`);
  await expect(paymentForm).toBeVisible();
  await expect(paymentForm.getByLabel('Payment amount')).toHaveValue(
    (result.registration.deposit_cents / 100).toFixed(2),
  );
  await paymentForm.getByLabel('Payment method').selectOption('OFFLINE_CASH');
  await paymentForm.getByLabel('Payment note').fill(`Cash ${suffix}`);
  await paymentForm.getByRole('button', { name: 'Record payment' }).click();

  await expect(paymentForm.getByRole('status')).toContainText('Payment recorded.');
  const paymentRow = page.locator('tr').filter({ has: paymentForm });
  await expect(
    paymentRow.getByText(
      new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(
        (result.registration.balance_due_cents - result.registration.deposit_cents) / 100,
      ),
    ),
  ).toBeVisible();
});

test('lets staff check in and check out a camper with authorized pickup', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const session = await createPortalTestSession(request, suffix, 'ATTEND');
  const firstName = 'Attend';
  const lastName = `Pickup${suffix}`;
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: firstName,
        gender: 'Female',
        last_name: lastName,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok()).toBeTruthy();
  const result = (await checkout.json()) as {
    registration: { registration_id: string; status: string };
  };
  expect(result.registration.status).toBe('CONFIRMED');

  await page.goto(`/sessions/${session.id}`);

  const attendance = page.getByTestId(`attendance-controls-${result.registration.registration_id}`);
  await expect(attendance).toBeVisible();
  await expect(attendance).toContainText('Not marked');
  await attendance.getByLabel('Attendance note').fill(`Arrived ${suffix}`);
  const checkInResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/registrations/${result.registration.registration_id}/attendance`) &&
      response.request().method() === 'POST',
  );
  await attendance.getByRole('button', { name: 'Check in' }).click();
  expect((await checkInResponse).ok()).toBeTruthy();

  await expect(attendance).toContainText('Checked in');
  await attendance.getByLabel('Pickup person').selectOption('Aisha Adams');
  await attendance.getByLabel('Attendance note').fill(`Dismissed ${suffix}`);
  const checkOutResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/registrations/${result.registration.registration_id}/attendance`) &&
      response.request().method() === 'POST',
  );
  await attendance.getByRole('button', { name: 'Check out' }).click();
  expect((await checkOutResponse).ok()).toBeTruthy();

  await expect(attendance).toContainText('Checked out');
  const rosterRow = page.locator('tr').filter({ has: attendance });
  await expect(rosterRow).toContainText('Aisha Adams');
});

test('lets staff run check-in desk actions from a focused queue', async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const session = await createPortalTestSession(request, suffix, 'DESK');
  const firstName = 'Desk';
  const lastName = `Pickup${suffix}`;
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: firstName,
        gender: 'Female',
        last_name: lastName,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok()).toBeTruthy();
  const result = (await checkout.json()) as {
    registration: { registration_id: string; status: string };
  };
  expect(result.registration.status).toBe('CONFIRMED');

  await page.goto(`/sessions/${session.id}`);
  await page.getByRole('link', { name: 'Check-in desk' }).click();

  await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}/check-in$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Check-in desk' })).toBeVisible();

  const deskRow = page.getByTestId(`check-in-row-${result.registration.registration_id}`);
  await expect(deskRow).toBeVisible();
  await expect(deskRow).toContainText('Not marked');
  await page.getByPlaceholder('Search camper, family, grade, or pickup').fill(lastName);
  await expect(deskRow).toBeVisible();

  await deskRow.getByLabel('Attendance note').fill(`Arrived ${suffix}`);
  const checkInResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/registrations/${result.registration.registration_id}/attendance`) &&
      response.request().method() === 'POST',
  );
  await deskRow.getByRole('button', { name: 'Check in' }).click();
  expect((await checkInResponse).ok()).toBeTruthy();

  await expect(deskRow).toContainText('Checked in');
  await deskRow.getByLabel('Pickup person').selectOption('Aisha Adams');
  await deskRow.getByLabel('Attendance note').fill(`Dismissed ${suffix}`);
  const checkOutResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/registrations/${result.registration.registration_id}/attendance`) &&
      response.request().method() === 'POST',
  );
  await deskRow.getByRole('button', { name: 'Check out' }).click();
  expect((await checkOutResponse).ok()).toBeTruthy();

  await expect(deskRow).toContainText('Checked out');
  await expect(deskRow).toContainText(`Dismissed ${suffix}`);
});

test('redirects the legacy registration route into the parent portal', async ({ page }) => {
  await page.goto('/register');

  await expect(page).toHaveURL('/portal/register');
});

test('lets parents cancel a registration from the camp plan', async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const session = await createPortalTestSession(request, suffix, 'CANCEL');
  const firstName = `Portal`;
  const lastName = `Cancel${suffix}`;
  const camperName = `${firstName} ${lastName}`;
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: firstName,
        gender: 'Female',
        last_name: lastName,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok()).toBeTruthy();

  await page.goto('/portal');
  const planItem = page.getByLabel(`${session.name} for ${camperName}`);
  await expect(planItem).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await planItem.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('status')).toContainText(
    `${session.name} registration cancelled for ${camperName}.`,
  );
  await expect(planItem).toBeHidden();
});

test('lets staff offer an open seat and the parent accept it', async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const session = await createCapacityOneSession(request, suffix);
  const waitlistedName = `Offer Camper${suffix}`;
  const firstCheckout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: 'Seat',
        gender: 'Female',
        last_name: `Holder${suffix}`,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(firstCheckout.ok(), await firstCheckout.text()).toBeTruthy();
  const firstResult = (await firstCheckout.json()) as {
    registration: { registration_id: string; status: string };
  };
  expect(firstResult.registration.status).toBe('CONFIRMED');

  const secondCheckout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-03-01',
        first_name: 'Offer',
        gender: 'Male',
        last_name: `Camper${suffix}`,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(secondCheckout.ok(), await secondCheckout.text()).toBeTruthy();
  const secondResult = (await secondCheckout.json()) as {
    registration: { registration_id: string; status: string };
  };
  expect(secondResult.registration.status).toBe('WAITLISTED');

  const cancellation = await request.post(
    `/api/v1/families/${adamsFamilyId}/registrations/${firstResult.registration.registration_id}/cancel`,
    { headers: parentHeaders },
  );
  expect(cancellation.ok(), await cancellation.text()).toBeTruthy();

  await page.goto(`/sessions/${session.id}`);
  const waitlistedRow = page.locator('tr').filter({ hasText: waitlistedName });
  await expect(waitlistedRow).toContainText('Waiting');
  await page.getByRole('button', { name: 'Offer next · 48 hours' }).click();
  await expect(page.getByRole('status')).toContainText('Offer reserved until');
  await expect(waitlistedRow).toContainText('Expires');

  await page.goto('/portal');
  const planItem = page.getByLabel(`${session.name} for ${waitlistedName}`);
  await expect(planItem).toContainText('A camp seat is ready for you');
  await planItem.getByRole('button', { name: 'Accept seat' }).click();

  await expect(page.getByRole('status')).toContainText(
    `${session.name} is confirmed for ${waitlistedName}.`,
  );
  await expect(planItem).toContainText('Confirmed');
});
