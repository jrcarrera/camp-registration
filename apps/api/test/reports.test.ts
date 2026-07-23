import type { RequestIdentity } from '@camp-registration/auth';
import type { RegisteredCamper, SessionDetail } from '@camp-registration/contracts';
import type { OperationalReportRowRecord } from '@camp-registration/database';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { ReportsService } from '../src/reports/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const sessionId = '28933fbb-470e-4ad6-9a74-600efe4232e3';

function identity(role: 'camp_admin' | 'camp_staff' | 'parent_guardian'): RequestIdentity {
  return {
    email: 'operator@example.test',
    emailVerified: true,
    memberships: [{ campIds: [], organizationId, roles: [role] }],
    mfaVerified: true,
    subject: 'report-operator',
  };
}

function camper(overrides: Partial<RegisteredCamper> = {}): RegisteredCamper {
  return {
    amount_paid_cents: 5000,
    attendance_date: null,
    attendance_note: null,
    attendance_status: 'NOT_MARKED',
    authorized_pickup_names: ['Morgan Example'],
    balance_due_cents: 45000,
    birth_date: '2016-04-12',
    camper_id: 'fa7c6bb7-0c52-4563-9488-e7b1ab3f44ab',
    checked_in_at: null,
    checked_out_at: null,
    currency: 'USD',
    deposit_cents: 5000,
    deposit_due_cents: 0,
    family_id: 'd21aa0cc-e99a-46f9-9f80-308b2b0ec799',
    family_name: '=HYPERLINK("https://example.invalid")',
    first_name: 'Avery',
    gender: 'Female',
    last_name: 'Example',
    payment_status: 'PARTIAL',
    pickup_name: null,
    preferred_name: 'Ave',
    price_cents: 50000,
    registered_at: '2026-07-19T15:30:00Z',
    registration_id: '41af7f8f-f972-4df8-8379-55aa2d444c9e',
    school_grade: '5',
    source: 'PARENT',
    status: 'CONFIRMED',
    ...overrides,
  };
}

const session: SessionDetail = {
  active_hold_count: 0,
  age_as_of: 'SESSION_START',
  available_count: 18,
  capacity: 20,
  code: 'PINE-01',
  currency: 'USD',
  deposit_cents: 5000,
  ends_on: '2027-06-18',
  id: sessionId,
  maximum_age: 15,
  maximum_grade: 10,
  minimum_age: 7,
  minimum_grade: 2,
  name: 'Pine Ridge',
  organization_id: organizationId,
  organization_timezone: 'America/Chicago',
  price_cents: 50000,
  program_id: '8140c5cd-1669-41d4-a293-5870472356e1',
  program_name: 'Overnight Camp',
  registered_campers: [
    camper(),
    camper({
      camper_id: '28d509e4-0bda-4af6-a3da-b911489ea8d1',
      first_name: 'Jordan',
      registration_id: '511133ed-02e8-45f2-a283-1556418127ca',
      status: 'WAITLISTED',
    }),
  ],
  registered_count: 1,
  registered_female_count: 1,
  registered_male_count: 0,
  registration_closes_at: '2027-06-01T05:00:00Z',
  registration_opens_at: '2027-01-01T06:00:00Z',
  season_id: 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85',
  starts_on: '2027-06-14',
  status: 'PUBLISHED',
  updated_at: '2026-07-19T15:00:00Z',
  version: 1,
  waitlist_enabled: true,
  waitlisted_count: 1,
  waitlisted_female_count: 1,
  waitlisted_male_count: 0,
};

function operationalRow(
  overrides: Partial<OperationalReportRowRecord> = {},
): OperationalReportRowRecord {
  return {
    adult_emails: 'guardian@example.test',
    adult_names: 'Morgan Example',
    adult_phones: '555-0100',
    attendance_date: null,
    attendance_note: null,
    attendance_status: 'NOT_MARKED',
    authorized_pickups: 'Morgan Example',
    balance_due_cents: 45000,
    birth_date: '2016-04-12',
    camper_name: 'Avery Example',
    checked_in_at: null,
    checked_out_at: null,
    emergency_contacts: 'Taylor Example (555-0101)',
    family_name: 'Example',
    form_assigned_count: 2,
    form_missing_count: 1,
    form_submitted_count: 1,
    gender: 'Female',
    payment_status: 'PARTIAL',
    pickup_name: null,
    preferred_name: 'Ave',
    registered_at: '2026-07-19T15:30:00Z',
    registration_id: '41af7f8f-f972-4df8-8379-55aa2d444c9e',
    registration_source: 'PARENT',
    registration_status: 'CONFIRMED',
    school_grade: '5',
    session_code: 'PINE-01',
    session_ends_on: '2027-06-18',
    session_id: sessionId,
    session_name: 'Pine Ridge',
    session_starts_on: '2027-06-14',
    support_note_on_file: true,
    ...overrides,
  };
}

function operationalStore() {
  return {
    createView: vi.fn(),
    deleteView: vi.fn(),
    listRows: vi.fn().mockResolvedValue([
      operationalRow(),
      operationalRow({
        camper_name: 'Jordan Example',
        registration_id: '511133ed-02e8-45f2-a283-1556418127ca',
        registration_status: 'WAITLISTED',
      }),
    ]),
    listViews: vi.fn().mockResolvedValue([]),
    recordExport: vi.fn().mockResolvedValue(undefined),
    updateView: vi.fn(),
  };
}

describe('operational reports API', () => {
  it('downloads an audited roster CSV and neutralizes spreadsheet formulas', async () => {
    const store = { exportSessionReport: vi.fn().mockResolvedValue(session) };
    const service = new ReportsService(store as never, identity('camp_staff'), organizationId);
    const app = await buildApp({ reportsService: service });

    const response = await app.inject({
      headers: { 'x-request-id': 'roster-export-test' },
      method: 'GET',
      url: `/v1/reports/sessions/${sessionId}/export?preset=SESSION_ROSTER`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="pine-01-session-roster.csv"',
    );
    expect(response.headers['x-report-row-count']).toBe('2');
    expect(response.body).toContain('"Balance due (USD)"');
    expect(response.body).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(store.exportSessionReport).toHaveBeenCalledWith({
      actorId: 'report-operator',
      organizationId,
      preset: 'SESSION_ROSTER',
      requestId: 'roster-export-test',
      sessionId,
    });
    await app.close();
  });

  it('limits the check-in preset to confirmed campers', async () => {
    const store = { exportSessionReport: vi.fn().mockResolvedValue(session) };
    const service = new ReportsService(store as never, identity('camp_admin'), organizationId);
    const app = await buildApp({ reportsService: service });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/reports/sessions/${sessionId}/export?preset=CHECK_IN_SHEET`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-report-row-count']).toBe('1');
    expect(response.body).toContain('"Avery Example"');
    expect(response.body).not.toContain('"Jordan Example"');
    await app.close();
  });

  it('denies report exports to parent identities', async () => {
    const store = { exportSessionReport: vi.fn() };
    const service = new ReportsService(store as never, identity('parent_guardian'), organizationId);
    const app = await buildApp({ reportsService: service });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/reports/sessions/${sessionId}/export?preset=SESSION_ROSTER`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: 'forbidden',
      message: 'Operational report access is not permitted',
    });
    expect(store.exportSessionReport).not.toHaveBeenCalled();
    await app.close();
  });

  it('previews cross-session presets with operational projections only', async () => {
    const store = { exportSessionReport: vi.fn() };
    const expanded = operationalStore();
    const service = new ReportsService(
      store as never,
      identity('camp_staff'),
      organizationId,
      expanded as never,
    );
    const app = await buildApp({ reportsService: service });

    const response = await app.inject({
      method: 'POST',
      payload: {
        filters: {
          end_date: null,
          registration_status: 'ALL',
          session_ids: [],
          start_date: null,
        },
        preset: 'READINESS',
      },
      url: '/v1/reports/preview',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      row_count: 1,
      rows: [
        {
          camper: 'Avery Example',
          forms_missing: 1,
          readiness_status: 'Missing forms',
          support_note: 'Yes',
        },
      ],
      title: 'Form readiness',
    });
    expect(response.body).not.toContain('accessibility_needs');
    expect(response.body).not.toContain('guardian@example.test');
    expect(response.body).not.toContain('authorized_pickups');
    await app.close();
  });

  it('downloads a native XLSX workbook and records an aggregate export audit', async () => {
    const store = { exportSessionReport: vi.fn() };
    const expanded = operationalStore();
    const service = new ReportsService(
      store as never,
      identity('camp_admin'),
      organizationId,
      expanded as never,
    );
    const app = await buildApp({ reportsService: service });

    const response = await app.inject({
      headers: { 'x-request-id': 'xlsx-export-test' },
      method: 'GET',
      url: '/v1/reports/export?preset=BALANCE_DUE&format=XLSX',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="balances-due.xlsx"',
    );
    expect(response.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(expanded.recordExport).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'report-operator', requestId: 'xlsx-export-test' }),
      'BALANCE_DUE',
      'XLSX',
      expect.objectContaining({ registration_status: 'ALL', session_ids: [] }),
      1,
    );
    await app.close();
  });

  it('returns every matching row for an explicit print preview', async () => {
    const store = { exportSessionReport: vi.fn() };
    const expanded = operationalStore();
    expanded.listRows.mockResolvedValue(
      Array.from({ length: 125 }, (_, index) =>
        operationalRow({ camper_name: `Camper ${index + 1}` }),
      ),
    );
    const service = new ReportsService(
      store as never,
      identity('camp_staff'),
      organizationId,
      expanded as never,
    );
    const app = await buildApp({ reportsService: service });

    const response = await app.inject({
      method: 'POST',
      payload: {
        filters: {
          end_date: null,
          registration_status: 'ALL',
          session_ids: [],
          start_date: null,
        },
        full: true,
        preset: 'CAMPER_LABELS',
      },
      url: '/v1/reports/preview',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ row_count: 125, truncated: false });
    expect(response.json().rows).toHaveLength(125);
    await app.close();
  });

  it('rejects invalid date ranges before querying report rows', async () => {
    const store = { exportSessionReport: vi.fn() };
    const expanded = operationalStore();
    const service = new ReportsService(
      store as never,
      identity('camp_staff'),
      organizationId,
      expanded as never,
    );
    const app = await buildApp({ reportsService: service });

    const response = await app.inject({
      method: 'POST',
      payload: {
        filters: {
          end_date: '2027-01-01',
          registration_status: 'ALL',
          session_ids: [],
          start_date: '2027-02-01',
        },
        preset: 'SESSION_ROSTER',
      },
      url: '/v1/reports/preview',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_report' });
    expect(expanded.listRows).not.toHaveBeenCalled();
    await app.close();
  });
});
