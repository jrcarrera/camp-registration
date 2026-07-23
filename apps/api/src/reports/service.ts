import type { RequestIdentity } from '@camp-registration/auth';
import type { SessionReportPreset } from '@camp-registration/contracts';
import { CatalogNotFoundError, type CatalogStore } from '@camp-registration/database';

const reportRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);

export class ReportsAuthorizationError extends Error {}

export interface SessionReportExport {
  content: string;
  filename: string;
  rowCount: number;
}

export interface ReportsServiceApi {
  exportSessionReport(
    sessionId: string,
    preset: SessionReportPreset,
    requestId: string,
  ): Promise<SessionReportExport>;
}

type ReportsStore = Pick<CatalogStore, 'exportSessionReport'>;

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
      .replace(/^-|-$/g, '') || 'session'
  );
}

export class ReportsService implements ReportsServiceApi {
  private readonly membership;

  constructor(
    private readonly store: ReportsStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  async exportSessionReport(
    sessionId: string,
    preset: SessionReportPreset,
    requestId: string,
  ): Promise<SessionReportExport> {
    if (!this.membership?.roles.some((role) => reportRoles.has(role))) {
      throw new ReportsAuthorizationError('Operational report access is not permitted');
    }

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

export { CatalogNotFoundError };
