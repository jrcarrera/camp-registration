import type { RequestIdentity } from '@camp-registration/auth';
import type {
  OperationalReportCenter,
  OperationalReportExportFormat,
  OperationalReportFilters,
  OperationalReportPreset,
  OperationalReportPreview,
  OperationalReportView,
  OperationalReportViewInput,
  OperationalReportViewUpdate,
  SessionReportPreset,
} from '@camp-registration/contracts';
import {
  CatalogNotFoundError,
  OperationalReportConflictError,
  OperationalReportNotFoundError,
  type CatalogStore,
  type OperationalReportRowRecord,
  type ReportingStore,
} from '@camp-registration/database';

import { xlsx } from './xlsx.js';

const reportRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const adminRoles = new Set(['camp_admin', 'organization_admin']);

export class ReportsAuthorizationError extends Error {}
export class ReportsUnavailableError extends Error {}
export class ReportsValidationError extends Error {}

export interface SessionReportExport {
  content: string;
  filename: string;
  rowCount: number;
}

export interface OperationalReportExport {
  content: Buffer | string;
  contentType: string;
  filename: string;
  rowCount: number;
}

export interface ReportsServiceApi {
  createView(input: OperationalReportViewInput, requestId: string): Promise<OperationalReportView>;
  deleteView(viewId: string, requestId: string): Promise<void>;
  exportOperationalReport(
    preset: OperationalReportPreset,
    format: OperationalReportExportFormat,
    filters: OperationalReportFilters,
    requestId: string,
  ): Promise<OperationalReportExport>;
  exportSessionReport(
    sessionId: string,
    preset: SessionReportPreset,
    requestId: string,
  ): Promise<SessionReportExport>;
  getCenter(): Promise<OperationalReportCenter>;
  previewReport(
    preset: OperationalReportPreset,
    filters: OperationalReportFilters,
    full?: boolean,
  ): Promise<OperationalReportPreview>;
  updateView(
    viewId: string,
    input: OperationalReportViewUpdate,
    requestId: string,
  ): Promise<OperationalReportView>;
}

type LegacyReportsStore = Pick<CatalogStore, 'exportSessionReport'>;
type OperationalReportsStore = Pick<
  ReportingStore,
  'createView' | 'deleteView' | 'listRows' | 'listViews' | 'recordExport' | 'updateView'
>;

interface ReportDefinition {
  columns: Array<{ key: string; label: string }>;
  include: (row: OperationalReportRowRecord) => boolean;
  title: string;
}

function csvCell(value: string | number | null): string {
  let normalized = value === null ? '' : String(value);
  normalized = normalized.replace(/\r\n|\r|\n/g, ' ');
  const leadingCharacter = normalized.trimStart().charAt(0);
  if (leadingCharacter && '=+-@'.includes(leadingCharacter)) normalized = `'${normalized}`;
  return `"${normalized.replaceAll('"', '""')}"`;
}

function csv(rows: Array<Array<string | number | null>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function filePart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'report'
  );
}

function reportContext(identity: RequestIdentity, organizationId: string, requestId: string) {
  return { actorId: identity.subject, organizationId, requestId };
}

function reportDefinition(preset: OperationalReportPreset): ReportDefinition {
  const confirmed = (row: OperationalReportRowRecord) => row.registration_status === 'CONFIRMED';
  const active = (row: OperationalReportRowRecord) => row.registration_status !== 'CANCELLED';
  const definitions: Record<OperationalReportPreset, ReportDefinition> = {
    ATTENDANCE: {
      columns: [
        { key: 'session', label: 'Session' },
        { key: 'camper', label: 'Camper' },
        { key: 'attendance_date', label: 'Attendance date' },
        { key: 'attendance_status', label: 'Attendance status' },
        { key: 'checked_in_at', label: 'Checked in at' },
        { key: 'checked_out_at', label: 'Checked out at' },
        { key: 'pickup_name', label: 'Pickup by' },
        { key: 'attendance_note', label: 'Attendance note' },
      ],
      include: confirmed,
      title: 'Attendance activity',
    },
    BALANCE_DUE: {
      columns: [
        { key: 'session', label: 'Session' },
        { key: 'camper', label: 'Camper' },
        { key: 'family', label: 'Family' },
        { key: 'guardians', label: 'Adults' },
        { key: 'emails', label: 'Email' },
        { key: 'phones', label: 'Phone' },
        { key: 'payment_status', label: 'Payment status' },
        { key: 'balance_due', label: 'Balance due (USD)' },
      ],
      include: (row) => confirmed(row) && row.balance_due_cents > 0,
      title: 'Balances due',
    },
    CAMPER_LABELS: {
      columns: [
        { key: 'camper', label: 'Camper' },
        { key: 'preferred_name', label: 'Preferred name' },
        { key: 'family', label: 'Family' },
        { key: 'session', label: 'Session' },
        { key: 'session_dates', label: 'Session dates' },
      ],
      include: confirmed,
      title: 'Camper labels',
    },
    CHECK_IN_SHEET: {
      columns: [
        { key: 'session', label: 'Session' },
        { key: 'camper', label: 'Camper' },
        { key: 'preferred_name', label: 'Preferred name' },
        { key: 'family', label: 'Family' },
        { key: 'attendance_status', label: 'Attendance status' },
        { key: 'checked_in_at', label: 'Checked in at' },
        { key: 'checked_out_at', label: 'Checked out at' },
        { key: 'pickup_name', label: 'Pickup by' },
        { key: 'authorized_pickups', label: 'Authorized pickups' },
        { key: 'attendance_note', label: 'Attendance note' },
      ],
      include: confirmed,
      title: 'Check-in sheet',
    },
    CONTACT_LIST: {
      columns: [
        { key: 'session', label: 'Session' },
        { key: 'camper', label: 'Camper' },
        { key: 'family', label: 'Family' },
        { key: 'guardians', label: 'Adults' },
        { key: 'emails', label: 'Email' },
        { key: 'phones', label: 'Phone' },
        { key: 'emergency_contacts', label: 'Emergency contacts' },
      ],
      include: active,
      title: 'Family contacts',
    },
    PICKUP_SHEET: {
      columns: [
        { key: 'session', label: 'Session' },
        { key: 'camper', label: 'Camper' },
        { key: 'family', label: 'Family' },
        { key: 'authorized_pickups', label: 'Authorized pickups' },
        { key: 'emergency_contacts', label: 'Emergency contacts' },
        { key: 'attendance_status', label: 'Attendance status' },
        { key: 'pickup_name', label: 'Pickup by' },
      ],
      include: confirmed,
      title: 'Pickup authorization sheet',
    },
    READINESS: {
      columns: [
        { key: 'session', label: 'Session' },
        { key: 'camper', label: 'Camper' },
        { key: 'family', label: 'Family' },
        { key: 'forms_assigned', label: 'Forms assigned' },
        { key: 'forms_submitted', label: 'Forms submitted' },
        { key: 'forms_missing', label: 'Forms missing' },
        { key: 'readiness_status', label: 'Readiness status' },
        { key: 'support_note', label: 'Support note on file' },
      ],
      include: confirmed,
      title: 'Form readiness',
    },
    SESSION_ROSTER: {
      columns: [
        { key: 'session_code', label: 'Session code' },
        { key: 'session', label: 'Session' },
        { key: 'session_dates', label: 'Session dates' },
        { key: 'camper', label: 'Camper' },
        { key: 'preferred_name', label: 'Preferred name' },
        { key: 'family', label: 'Family' },
        { key: 'registration_status', label: 'Registration status' },
        { key: 'gender', label: 'Gender' },
        { key: 'grade', label: 'Grade' },
        { key: 'birth_date', label: 'Birth date' },
        { key: 'support_note', label: 'Support note on file' },
        { key: 'payment_status', label: 'Payment status' },
        { key: 'balance_due', label: 'Balance due (USD)' },
        { key: 'registration_source', label: 'Registration source' },
        { key: 'registered_at', label: 'Registered at' },
      ],
      include: active,
      title: 'Cross-session roster',
    },
    WAITLIST: {
      columns: [
        { key: 'session', label: 'Session' },
        { key: 'session_start', label: 'Session start' },
        { key: 'camper', label: 'Camper' },
        { key: 'family', label: 'Family' },
        { key: 'guardians', label: 'Adults' },
        { key: 'emails', label: 'Email' },
        { key: 'phones', label: 'Phone' },
        { key: 'registered_at', label: 'Waitlisted at' },
      ],
      include: (row) => row.registration_status === 'WAITLISTED',
      title: 'Waitlist',
    },
  };
  return definitions[preset];
}

function reportRow(row: OperationalReportRowRecord): Record<string, number | string | null> {
  return {
    attendance_date: row.attendance_date,
    attendance_note: row.attendance_note,
    attendance_status: row.attendance_status,
    authorized_pickups: row.authorized_pickups,
    balance_due: dollars(row.balance_due_cents),
    birth_date: row.birth_date,
    camper: row.camper_name,
    checked_in_at: row.checked_in_at,
    checked_out_at: row.checked_out_at,
    emails: row.adult_emails,
    emergency_contacts: row.emergency_contacts,
    family: row.family_name,
    forms_assigned: row.form_assigned_count,
    forms_missing: row.form_missing_count,
    forms_submitted: row.form_submitted_count,
    gender: row.gender,
    grade: row.school_grade,
    guardians: row.adult_names,
    payment_status: row.payment_status,
    phones: row.adult_phones,
    pickup_name: row.pickup_name,
    preferred_name: row.preferred_name,
    readiness_status:
      row.form_assigned_count === 0
        ? 'No forms assigned'
        : row.form_missing_count === 0
          ? 'Complete'
          : 'Missing forms',
    registered_at: row.registered_at,
    registration_source: row.registration_source,
    registration_status: row.registration_status,
    session: row.session_name,
    session_code: row.session_code,
    session_dates: `${row.session_starts_on} – ${row.session_ends_on}`,
    session_start: row.session_starts_on,
    support_note: row.support_note_on_file ? 'Yes' : 'No',
  };
}

function validateFilters(filters: OperationalReportFilters): void {
  if (filters.start_date && filters.end_date && filters.start_date > filters.end_date) {
    throw new ReportsValidationError('Start date must be on or before end date');
  }
}

export class ReportsService implements ReportsServiceApi {
  private readonly membership;

  constructor(
    private readonly store: LegacyReportsStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
    private readonly operationalStore?: OperationalReportsStore,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private authorize(): void {
    if (!this.membership?.roles.some((role) => reportRoles.has(role))) {
      throw new ReportsAuthorizationError('Operational report access is not permitted');
    }
  }

  private operations(): OperationalReportsStore {
    this.authorize();
    if (!this.operationalStore)
      throw new ReportsUnavailableError('Expanded reporting is unavailable');
    return this.operationalStore;
  }

  private canEdit(createdBy: string): boolean {
    return (
      createdBy === this.identity.subject ||
      Boolean(this.membership?.roles.some((role) => adminRoles.has(role)))
    );
  }

  private view(
    record: Awaited<ReturnType<OperationalReportsStore['listViews']>>[number],
  ): OperationalReportView {
    const { created_by, ...view } = record;
    return { ...view, can_edit: this.canEdit(created_by) };
  }

  private async renderReport(preset: OperationalReportPreset, filters: OperationalReportFilters) {
    validateFilters(filters);
    const rows = await this.operations().listRows(this.organizationId, filters);
    const definition = reportDefinition(preset);
    return {
      definition,
      rows: rows.filter(definition.include).map((row) => {
        const rendered = reportRow(row);
        return Object.fromEntries(
          definition.columns.map((column) => [column.key, rendered[column.key] ?? null]),
        );
      }),
    };
  }

  async getCenter(): Promise<OperationalReportCenter> {
    const views = await this.operations().listViews(this.organizationId);
    return { saved_views: views.map((view) => this.view(view)) };
  }

  async previewReport(
    preset: OperationalReportPreset,
    filters: OperationalReportFilters,
    full = false,
  ): Promise<OperationalReportPreview> {
    const { definition, rows } = await this.renderReport(preset, filters);
    return {
      columns: definition.columns,
      preset,
      row_count: rows.length,
      rows: full ? rows : rows.slice(0, 100),
      title: definition.title,
      truncated: !full && rows.length > 100,
    };
  }

  async exportOperationalReport(
    preset: OperationalReportPreset,
    format: OperationalReportExportFormat,
    filters: OperationalReportFilters,
    requestId: string,
  ): Promise<OperationalReportExport> {
    const { definition, rows } = await this.renderReport(preset, filters);
    const content =
      format === 'XLSX'
        ? xlsx(definition.title, definition.columns, rows)
        : csv([
            definition.columns.map((column) => column.label),
            ...rows.map((row) => definition.columns.map((column) => row[column.key] ?? null)),
          ]);
    await this.operations().recordExport(
      reportContext(this.identity, this.organizationId, requestId),
      preset,
      format,
      filters,
      rows.length,
    );
    return {
      content,
      contentType:
        format === 'XLSX'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8',
      filename: `${filePart(definition.title)}.${format.toLowerCase()}`,
      rowCount: rows.length,
    };
  }

  async createView(
    input: OperationalReportViewInput,
    requestId: string,
  ): Promise<OperationalReportView> {
    validateFilters(input.filters);
    const created = await this.operations().createView(
      reportContext(this.identity, this.organizationId, requestId),
      input,
    );
    return this.view(created);
  }

  async updateView(
    viewId: string,
    input: OperationalReportViewUpdate,
    requestId: string,
  ): Promise<OperationalReportView> {
    const store = this.operations();
    const current = (await store.listViews(this.organizationId)).find((view) => view.id === viewId);
    if (!current) throw new OperationalReportNotFoundError('Saved report view not found');
    if (!this.canEdit(current.created_by)) {
      throw new ReportsAuthorizationError('Only the view owner or an administrator may edit it');
    }
    const update = {
      default_format: input.default_format ?? current.default_format,
      filters: input.filters ?? current.filters,
      name: input.name ?? current.name,
      preset: input.preset ?? current.preset,
      version: input.version,
    };
    validateFilters(update.filters);
    return this.view(
      await store.updateView(
        reportContext(this.identity, this.organizationId, requestId),
        viewId,
        update,
      ),
    );
  }

  async deleteView(viewId: string, requestId: string): Promise<void> {
    const store = this.operations();
    const current = (await store.listViews(this.organizationId)).find((view) => view.id === viewId);
    if (!current) throw new OperationalReportNotFoundError('Saved report view not found');
    if (!this.canEdit(current.created_by)) {
      throw new ReportsAuthorizationError('Only the view owner or an administrator may delete it');
    }
    await store.deleteView(reportContext(this.identity, this.organizationId, requestId), viewId);
  }

  async exportSessionReport(
    sessionId: string,
    preset: SessionReportPreset,
    requestId: string,
  ): Promise<SessionReportExport> {
    this.authorize();
    const session = await this.store.exportSessionReport({
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      preset,
      requestId,
      sessionId,
    });
    if (!session) throw new CatalogNotFoundError('Session not found');

    if (preset === 'CHECK_IN_SHEET') {
      const campers = session.registered_campers.filter((camper) => camper.status === 'CONFIRMED');
      const rows: Array<Array<string | number | null>> = [
        [
          'Session code',
          'Session name',
          'Camper',
          'Preferred name',
          'Family',
          'Attendance status',
          'Checked in at',
          'Checked out at',
          'Pickup by',
          'Authorized pickups',
          'Attendance note',
        ],
        ...campers.map((camper) => [
          session.code,
          session.name,
          `${camper.first_name} ${camper.last_name}`,
          camper.preferred_name,
          camper.family_name,
          camper.attendance_status,
          camper.checked_in_at,
          camper.checked_out_at,
          camper.pickup_name,
          camper.authorized_pickup_names.join('; '),
          camper.attendance_note,
        ]),
      ];
      return {
        content: csv(rows),
        filename: `${filePart(session.code)}-check-in-sheet.csv`,
        rowCount: campers.length,
      };
    }

    const rows: Array<Array<string | number | null>> = [
      [
        'Session code',
        'Session name',
        'Camper',
        'Preferred name',
        'Family',
        'Registration status',
        'Gender',
        'Grade',
        'Birth date',
        'Attendance status',
        'Authorized pickups',
        'Payment status',
        'Balance due (USD)',
        'Registration source',
        'Registered at',
      ],
      ...session.registered_campers.map((camper) => [
        session.code,
        session.name,
        `${camper.first_name} ${camper.last_name}`,
        camper.preferred_name,
        camper.family_name,
        camper.status,
        camper.gender,
        camper.school_grade,
        camper.birth_date,
        camper.attendance_status,
        camper.authorized_pickup_names.join('; '),
        camper.payment_status,
        dollars(camper.balance_due_cents),
        camper.source,
        camper.registered_at,
      ]),
    ];
    return {
      content: csv(rows),
      filename: `${filePart(session.code)}-session-roster.csv`,
      rowCount: session.registered_campers.length,
    };
  }
}

export { CatalogNotFoundError, OperationalReportConflictError, OperationalReportNotFoundError };
