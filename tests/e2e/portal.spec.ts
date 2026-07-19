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

async function createPortalTestCamper(
  request: APIRequestContext,
  suffix: string,
  label: string,
): Promise<string> {
  const lastName = `${label}${suffix}`;
  const response = await request.post(`/api/v1/families/${adamsFamilyId}/campers`, {
    data: {
      birth_date: '2018-02-01',
      first_name: 'Order',
      gender: 'Female',
      last_name: lastName,
      school_grade: '3',
    },
    headers: parentHeaders,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const family = (await response.json()) as {
    campers: Array<{ id: string; last_name: string }>;
  };
  return family.campers.find((camper) => camper.last_name === lastName)!.id;
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

test('renders the parent household cart without a family selector', async ({ page }) => {
  await page.goto('/portal/register');

  await expect(page.getByRole('heading', { level: 1, name: 'Register for camp' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Campers and sessions' })).toBeVisible();
  await expect(page.getByLabel('Family account')).toHaveCount(0);
  await expect(page.getByLabel('Session for registration 1')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Order review' })).toBeVisible();
});

test('checks out two household cart lines with one hosted payment', async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const first = await createPortalTestSession(request, suffix, 'CART-A');
  const second = await createPortalTestSession(request, `${suffix}-b`, 'CART-B');

  await page.goto('/portal/register');
  await page.getByLabel('Camper for registration 1').selectOption({ label: 'Amara Adams' });
  await page.getByLabel('Session for registration 1').selectOption(first.id);
  await page.getByRole('button', { name: 'Add another camper or session' }).click();
  await page.getByLabel('Camper for registration 2').selectOption({ label: 'Amara Adams' });
  await page.getByLabel('Session for registration 2').selectOption(second.id);
  await page.getByRole('button', { name: 'Review order' }).click();

  const review = page.getByRole('complementary', { name: 'Order review' });
  await expect(review.getByText(first.name)).toBeVisible();
  await expect(review.getByText(second.name)).toBeVisible();
  await review.getByRole('button', { name: /Continue to payment/ }).click();

  await expect(page.getByText('Local development checkout')).toBeVisible();
  await page.getByRole('button', { name: /Complete test payment/ }).click();
  await expect(page).toHaveURL(/\/portal\?payment=success/);
  await expect(page.getByRole('status')).toContainText('Payment received');
});

test('returns mixed outcomes and all-or-none grouped waitlisting', async ({
  isMobile,
  request,
}) => {
  test.skip(Boolean(isMobile), 'The API transaction is viewport-independent.');
  const suffix = uniqueSuffix();
  const full = await createCapacityOneSession(request, suffix);
  const available = await createPortalTestSession(request, suffix, 'MIXED');
  const groupedAvailable = await createPortalTestSession(request, `${suffix}-g`, 'GROUPED');
  const mixedCamperId = await createPortalTestCamper(request, suffix, 'Mixed');
  const groupedCamperId = await createPortalTestCamper(request, suffix, 'Grouped');
  const holder = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: 'Capacity',
        gender: 'Female',
        last_name: `Holder${suffix}`,
        school_grade: '3',
      },
      session_id: full.id,
    },
    headers: parentHeaders,
  });
  expect(holder.ok(), await holder.text()).toBeTruthy();
  const mixed = await request.post(`/api/v1/families/${adamsFamilyId}/orders`, {
    data: {
      idempotency_key: crypto.randomUUID(),
      lines: [
        { camper_id: mixedCamperId, session_id: available.id },
        { camper_id: mixedCamperId, session_id: full.id },
      ],
      waitlist_mode: 'INDIVIDUAL',
    },
    headers: parentHeaders,
  });
  expect(mixed.ok(), await mixed.text()).toBeTruthy();
  const mixedOrder = (await mixed.json()) as { lines: Array<{ outcome: string }> };
  expect(mixedOrder.lines.map((line) => line.outcome).sort()).toEqual(['HELD', 'WAITLISTED']);

  const grouped = await request.post(`/api/v1/families/${adamsFamilyId}/orders`, {
    data: {
      idempotency_key: crypto.randomUUID(),
      lines: [
        { camper_id: groupedCamperId, session_id: groupedAvailable.id },
        { camper_id: groupedCamperId, session_id: full.id },
      ],
      waitlist_mode: 'KEEP_TOGETHER',
    },
    headers: parentHeaders,
  });
  expect(grouped.ok(), await grouped.text()).toBeTruthy();
  const groupedOrder = (await grouped.json()) as {
    lines: Array<{ outcome: string }>;
    waitlist_mode: string;
  };
  expect(groupedOrder.waitlist_mode).toBe('KEEP_TOGETHER');
  expect(groupedOrder.lines.every((line) => line.outcome === 'WAITLISTED')).toBeTruthy();
});

test('applies add-ons, discounts, coupons, assistance, and pays an installment', async ({
  isMobile,
  request,
}) => {
  test.skip(Boolean(isMobile), 'The API transaction is viewport-independent.');
  const suffix = uniqueSuffix();
  const first = await createPortalTestSession(request, suffix, 'PRICE-A');
  const second = await createPortalTestSession(request, `${suffix}-b`, 'PRICE-B');
  const camperId = await createPortalTestCamper(request, suffix, 'Pricing');
  const addOnResponse = await request.post(`/api/v1/sessions/${first.id}/add-ons`, {
    data: {
      active: true,
      description: 'Required E2E lunch option.',
      name: `Lunch ${suffix}`,
      price_cents: 1000,
      required: true,
    },
  });
  expect(addOnResponse.ok(), await addOnResponse.text()).toBeTruthy();
  const addOn = (await addOnResponse.json()) as { id: string };
  const discount = await request.post('/api/v1/pricing/discount-rules', {
    data: {
      active: true,
      minimum_qualifying_lines: 2,
      name: `Multi-session ${suffix}`,
      priority: 10,
      rule_type: 'MULTI_SESSION',
      season_id: portalTestSeasonId,
      value: 1000,
      value_type: 'PERCENT',
    },
  });
  expect(discount.ok(), await discount.text()).toBeTruthy();
  const coupon = await request.post('/api/v1/pricing/coupons', {
    data: {
      active: true,
      code: `E2E${suffix}`.toUpperCase(),
      ends_at: null,
      maximum_redemptions: 10,
      season_id: portalTestSeasonId,
      starts_at: null,
      value: 500,
      value_type: 'PERCENT',
    },
  });
  expect(coupon.ok(), await coupon.text()).toBeTruthy();
  const planResponse = await request.post('/api/v1/pricing/payment-plans', {
    data: {
      active: true,
      installments: [
        { due_on: '2027-03-01', percentage_basis_points: 5000, sequence: 1 },
        { due_on: '2027-04-01', percentage_basis_points: 5000, sequence: 2 },
      ],
      name: `Spring split ${suffix}`,
      season_id: portalTestSeasonId,
    },
  });
  expect(planResponse.ok(), await planResponse.text()).toBeTruthy();
  const plan = (await planResponse.json()) as { id: string };
  const assistanceResponse = await request.post(
    `/api/v1/families/${adamsFamilyId}/financial-assistance`,
    {
      data: {
        camper_id: camperId,
        requested_cents: 2000,
        season_id: portalTestSeasonId,
        statement: 'E2E private assistance statement for this household.',
        submit: true,
      },
      headers: parentHeaders,
    },
  );
  expect(assistanceResponse.ok(), await assistanceResponse.text()).toBeTruthy();
  const assistance = (await assistanceResponse.json()) as { id: string; version: number };
  const review = await request.post(`/api/v1/financial-assistance/${assistance.id}/review`, {
    data: {
      approved_cents: 2000,
      internal_note: 'E2E approval.',
      status: 'APPROVED',
      version: assistance.version,
    },
  });
  expect(review.ok(), await review.text()).toBeTruthy();

  const selection = {
    coupon_code: `e2e${suffix}`,
    lines: [
      { add_on_ids: [addOn.id], camper_id: camperId, session_id: first.id },
      { camper_id: camperId, session_id: second.id },
    ],
    payment_plan_template_id: plan.id,
    waitlist_mode: 'INDIVIDUAL',
  };
  const quoteResponse = await request.post(`/api/v1/families/${adamsFamilyId}/order-quotes`, {
    data: selection,
    headers: parentHeaders,
  });
  expect(quoteResponse.ok(), await quoteResponse.text()).toBeTruthy();
  const quote = (await quoteResponse.json()) as {
    totals: {
      assistance_cents: number;
      automatic_discount_cents: number;
      coupon_discount_cents: number;
    };
  };
  expect(quote.totals.automatic_discount_cents).toBeGreaterThan(0);
  expect(quote.totals.coupon_discount_cents).toBeGreaterThan(0);
  expect(quote.totals.assistance_cents).toBe(2000);

  const orderResponse = await request.post(`/api/v1/families/${adamsFamilyId}/orders`, {
    data: { ...selection, idempotency_key: crypto.randomUUID() },
    headers: parentHeaders,
  });
  expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
  const order = (await orderResponse.json()) as { id: string };
  const depositResponse = await request.post(
    `/api/v1/families/${adamsFamilyId}/orders/${order.id}/online-payment`,
    { data: { idempotency_key: crypto.randomUUID() }, headers: parentHeaders },
  );
  expect(depositResponse.ok(), await depositResponse.text()).toBeTruthy();
  const deposit = (await depositResponse.json()) as { attempt_id: string };
  const completeDeposit = await request.post(
    `/api/v1/payments/local/${deposit.attempt_id}/complete`,
    {
      headers: parentHeaders,
    },
  );
  expect(completeDeposit.ok(), await completeDeposit.text()).toBeTruthy();

  const confirmedResponse = await request.get(
    `/api/v1/families/${adamsFamilyId}/orders/${order.id}`,
    { headers: parentHeaders },
  );
  const confirmed = (await confirmedResponse.json()) as {
    installments: Array<{ id: string; status: string }>;
  };
  expect(confirmed.installments).toHaveLength(2);
  const installmentResponse = await request.post(
    `/api/v1/families/${adamsFamilyId}/installments/${confirmed.installments[0]!.id}/online-payment`,
    { data: { idempotency_key: crypto.randomUUID() }, headers: parentHeaders },
  );
  expect(installmentResponse.ok(), await installmentResponse.text()).toBeTruthy();
  const installment = (await installmentResponse.json()) as { attempt_id: string };
  const completeInstallment = await request.post(
    `/api/v1/payments/local/${installment.attempt_id}/complete`,
    { headers: parentHeaders },
  );
  expect(completeInstallment.ok(), await completeInstallment.text()).toBeTruthy();
  const paidResponse = await request.get(`/api/v1/families/${adamsFamilyId}/orders/${order.id}`, {
    headers: parentHeaders,
  });
  const paid = (await paidResponse.json()) as { installments: Array<{ status: string }> };
  expect(paid.installments[0]!.status).toBe('PAID');
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

test('lets staff publish a waiver and a parent save and submit it', async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const session = await createPortalTestSession(request, suffix, 'FORMS');
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: 'Forms',
        gender: 'Female',
        last_name: `Camper${suffix}`,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok(), await checkout.text()).toBeTruthy();

  const formName = `E2E participation waiver ${suffix}`;
  const createdResponse = await request.post('/api/v1/forms', {
    data: {
      description: 'Review and accept this test participation policy.',
      fields: [
        {
          id: 'policy_ack',
          label: 'I accept the participation policy',
          options: [],
          required: true,
          type: 'ACKNOWLEDGEMENT',
        },
        {
          id: 'signature',
          label: 'Parent or guardian signature',
          options: [],
          required: true,
          type: 'SIGNATURE',
        },
      ],
      name: formName,
    },
  });
  expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
  const created = (await createdResponse.json()) as { id: string; version: number };
  const publishResponse = await request.post(`/api/v1/forms/${created.id}/publish`, {
    data: { due_at: null, session_ids: [session.id], version: created.version },
  });
  expect(publishResponse.ok(), await publishResponse.text()).toBeTruthy();

  await page.goto('/portal/forms');

  await expect(page.getByRole('heading', { level: 1, name: 'Forms & waivers' })).toBeVisible();
  const form = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: formName }) });
  await expect(form).toBeVisible();
  await form.getByLabel('I accept the participation policy').check();
  await form.getByLabel('Parent or guardian signature').fill('Avery Adams');
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect(form.getByRole('status')).toContainText('Draft saved.');

  await form.getByRole('button', { name: 'Submit form' }).click();
  await expect(form.getByRole('status')).toContainText('Form submitted.');
  await expect(form.getByText('Complete', { exact: true })).toBeVisible();
  await expect(form.getByLabel('Parent or guardian signature')).toBeDisabled();
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

test('lets a parent pay the remaining deposit through hosted checkout', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const session = await createPortalTestSession(request, suffix, 'ONLINE-PAY');
  const checkout = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
    data: {
      new_camper: {
        birth_date: '2018-02-01',
        first_name: 'Online',
        gender: 'Female',
        last_name: `Payment${suffix}`,
        school_grade: '3',
      },
      session_id: session.id,
    },
    headers: parentHeaders,
  });
  expect(checkout.ok(), await checkout.text()).toBeTruthy();
  const result = (await checkout.json()) as {
    registration: { deposit_cents: number; registration_id: string };
  };

  await page.goto('/portal');
  const registration = page
    .locator('article')
    .filter({ has: page.getByText(session.name, { exact: true }) });
  const payButton = registration.getByRole('button', {
    name: `Pay $${(result.registration.deposit_cents / 100).toFixed(2)} deposit`,
  });
  await expect(payButton).toBeVisible();
  await payButton.click();

  await expect(page.getByRole('heading', { level: 1, name: 'Pay camp deposit' })).toBeVisible();
  await expect(page.getByText('Local development checkout')).toBeVisible();
  const completeButton = page.getByRole('button', { name: /Complete test payment/ });
  await completeButton.click();
  const completed = await page
    .waitForURL(/\/portal\?payment=success/, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!completed) {
    await expect(completeButton).toBeEnabled();
    await completeButton.click();
  }

  await expect(page).toHaveURL(/\/portal\?payment=success/);
  await expect(page.getByRole('status')).toContainText('Payment received');
  await expect(
    page
      .locator('article')
      .filter({ has: page.getByText(session.name, { exact: true }) })
      .getByRole('button', { name: /Pay .* deposit/ }),
  ).toHaveCount(0);
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

test('lets staff manage an offer before the parent accepts the next seat', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const session = await createCapacityOneSession(request, suffix);
  const waitlistedName = `Offer Camper${suffix}`;
  const groupedName = `Grouped Camper${suffix}`;
  const priorityName = `Priority Camper${suffix}`;
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

  const createWaitlistedCamper = async (birthDate: string, firstName: string, lastName: string) => {
    const response = await request.post(`/api/v1/families/${adamsFamilyId}/checkout`, {
      data: {
        new_camper: {
          birth_date: birthDate,
          first_name: firstName,
          gender: 'Male',
          last_name: lastName,
          school_grade: '3',
        },
        session_id: session.id,
      },
      headers: parentHeaders,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const result = (await response.json()) as {
      registration: { registration_id: string; status: string };
    };
    expect(result.registration.status).toBe('WAITLISTED');
    return result;
  };
  await createWaitlistedCamper('2018-03-01', 'Offer', `Camper${suffix}`);
  await createWaitlistedCamper('2018-04-01', 'Grouped', `Camper${suffix}`);
  await createWaitlistedCamper('2018-05-01', 'Priority', `Camper${suffix}`);

  const cancellation = await request.post(
    `/api/v1/families/${adamsFamilyId}/registrations/${firstResult.registration.registration_id}/cancel`,
    { headers: parentHeaders },
  );
  expect(cancellation.ok(), await cancellation.text()).toBeTruthy();

  await page.goto(`/sessions/${session.id}`);
  const queueManager = page.locator('.waitlistQueueManager');
  const queueItems = queueManager.locator('.waitlistQueueList li');
  const queueSearch = queueManager.getByLabel('Search waitlist');
  const offerFilter = queueManager.getByLabel('Offer status');
  await expect(queueItems).toHaveCount(3);

  await queueSearch.fill(priorityName);
  await expect(queueItems).toHaveCount(1);
  await expect(queueItems).toContainText('#3');
  await queueItems.getByRole('checkbox', { name: new RegExp(priorityName) }).check();
  await queueManager.getByRole('button', { name: 'Top', exact: true }).click();
  await expect(queueItems).toContainText('#1');
  await queueManager.getByRole('button', { name: 'Clear filters' }).click();
  await expect(queueItems).toHaveCount(3);
  await expect(queueItems.nth(0)).toContainText(priorityName);
  await queueManager.getByRole('button', { name: 'Reset' }).click();
  await expect(queueItems.nth(0)).toContainText(waitlistedName);
  await expect(queueItems.nth(1)).toContainText(groupedName);
  await expect(queueItems.nth(2)).toContainText(priorityName);

  await offerFilter.selectOption('active');
  await expect(queueItems).toHaveCount(0);
  await expect(queueManager.getByText('No campers match these filters')).toBeVisible();
  await offerFilter.selectOption('all');

  await queueManager.getByRole('checkbox', { name: new RegExp(waitlistedName) }).check();
  await queueManager.getByRole('checkbox', { name: new RegExp(priorityName) }).check();
  await queueManager.getByRole('button', { name: 'Group together' }).click();
  await expect(queueManager.locator('li').nth(0)).toContainText(waitlistedName);
  await expect(queueManager.locator('li').nth(1)).toContainText(priorityName);
  await expect(queueManager.locator('li').nth(2)).toContainText(groupedName);
  await queueManager.getByRole('button', { name: 'Down', exact: true }).click();
  await expect(queueManager.locator('li').nth(0)).toContainText(groupedName);
  await expect(queueManager.locator('li').nth(1)).toContainText(waitlistedName);
  await expect(queueManager.locator('li').nth(2)).toContainText(priorityName);
  await queueManager.getByLabel('Reason for change').fill('Keep selected campers together.');
  await queueManager.getByRole('button', { name: 'Save order' }).click();
  await expect(queueManager.getByRole('status')).toContainText('Waitlist order saved.');

  const waitlistedRow = page.locator('tr').filter({ hasText: groupedName });
  await expect(waitlistedRow).toContainText('Waiting');
  await expect(waitlistedRow).toContainText('Queue #1');
  await page.getByLabel('Waitlist offer claim window').selectOption('24');
  await page.getByRole('button', { name: 'Offer next', exact: true }).click();
  await expect(page.locator('.waitlistAction').getByRole('status')).toContainText(
    'Offer reserved until',
  );
  await expect(waitlistedRow).toContainText('Expires');
  await offerFilter.selectOption('active');
  await expect(queueItems).toHaveCount(1);
  await expect(queueItems).toContainText(groupedName);
  await expect(queueItems).toContainText('#1');
  await offerFilter.selectOption('all');

  const cancelButton = waitlistedRow.getByRole('button', { exact: true, name: 'Cancel' });
  await cancelButton.click();
  const cancelDialog = page.getByRole('dialog', { name: 'Cancel waitlist offer?' });
  await expect(cancelDialog).toBeVisible();
  await expect(cancelDialog).toContainText(
    'may receive another offer during the next automation cycle',
  );
  await expect(cancelDialog.getByLabel('Reason for cancelling this offer')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cancelDialog).toBeHidden();
  await expect(cancelButton).toBeFocused();

  await cancelButton.click();
  await cancelDialog.getByRole('button', { exact: true, name: 'Cancel offer' }).click();
  await expect(cancelDialog.getByRole('alert')).toContainText('Enter at least 3 characters');
  await cancelDialog
    .getByLabel('Reason for cancelling this offer')
    .fill('Family requested a fresh offer window.');
  await cancelDialog.getByRole('button', { exact: true, name: 'Cancel offer' }).click();
  await expect(cancelDialog).toBeHidden();
  await expect(waitlistedRow).toContainText('Cancelled');
  await expect(waitlistedRow).toContainText('Queue #1');

  await page.getByRole('button', { name: 'Offer next', exact: true }).click();
  await expect(waitlistedRow).toContainText('Expires');
  await waitlistedRow.getByRole('button', { exact: true, name: 'Skip' }).click();
  const skipDialog = page.getByRole('dialog', { name: 'Move camper to the end?' });
  await expect(skipDialog).toBeVisible();
  await expect(skipDialog).toContainText('will move to the end of the waitlist');
  await skipDialog
    .getByLabel('Reason for skipping this offer')
    .fill('Operator approved advancing the next camper.');
  await skipDialog.getByRole('button', { exact: true, name: 'Move to end' }).click();
  await expect(skipDialog).toBeHidden();
  await expect(waitlistedRow).toContainText('Cancelled');
  await expect(waitlistedRow).toContainText('Queue #3');

  const nextWaitlistedRow = page.locator('tr').filter({ hasText: waitlistedName });
  await page.getByRole('button', { name: 'Offer next', exact: true }).click();
  await expect(nextWaitlistedRow).toContainText('Expires');
  await nextWaitlistedRow.getByRole('button', { name: 'Resend' }).click();
  await expect(nextWaitlistedRow.getByRole('status')).toContainText(
    'Offer notification queued again.',
  );

  await page.goto('/portal');
  const planItem = page.getByLabel(`${session.name} for ${waitlistedName}`);
  await expect(planItem).toContainText('A camp seat is ready for you');
  await planItem.getByRole('button', { name: 'Accept seat' }).click();

  await expect(page.getByRole('status')).toContainText(
    `${session.name} is confirmed for ${waitlistedName}.`,
  );
  await expect(planItem).toContainText('Confirmed');
});
