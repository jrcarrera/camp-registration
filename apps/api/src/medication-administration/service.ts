import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  MedicationAdministration,
  MedicationAdministrationCenter,
  MedicationAdministrationCreate,
  MedicationAdministrationQuery,
  MedicationOrder,
  MedicationOrderCreate,
  MedicationScheduledDose,
} from '@camp-registration/contracts';
import {
  MedicationAdministrationNotFoundError,
  type EncryptedMedicationAdministrationRecord,
  type EncryptedMedicationOrderRecord,
  type MedicationAdministrationStore,
} from '@camp-registration/database';

import type { HealthEncryptionProvider } from '../health-records/encryption.js';

const authorizedRoles = new Set(['health_staff', 'camp_admin', 'organization_admin']);

interface MedicationOrderPayload {
  administration_times: string[];
  dose: string;
  instructions: string;
  medication_name: string;
}

interface MedicationAdministrationPayload {
  note: string;
}

export class MedicationAdministrationAuthorizationError extends Error {}
export class MedicationAdministrationEncryptionError extends Error {}
export class MedicationAdministrationInputError extends Error {}

export interface MedicationAdministrationServiceApi {
  createOrder(input: MedicationOrderCreate, requestId: string): Promise<MedicationOrder>;
  discontinueOrder(orderId: string, version: number, requestId: string): Promise<MedicationOrder>;
  getCenter(
    query: MedicationAdministrationQuery,
    requestId: string,
  ): Promise<MedicationAdministrationCenter>;
  recordAdministration(
    orderId: string,
    input: MedicationAdministrationCreate,
    requestId: string,
  ): Promise<MedicationAdministration>;
}

function dateParts(value: Date, timezone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value === '24' && part.type === 'hour' ? '00' : part.value]),
  );
}

function localDate(value: Date, timezone: string): string {
  const parts = dateParts(value, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validLocalDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
  );
}

function nextDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return date.toISOString().slice(0, 10);
}

function utcForLocal(date: string, time: string, timezone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year!, month! - 1, day, hour, minute);
  let candidate = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = dateParts(new Date(candidate), timezone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    candidate += target - represented;
  }
  const resolved = new Date(candidate);
  const parts = dateParts(resolved, timezone);
  const resolvedDate = `${parts.year}-${parts.month}-${parts.day}`;
  const resolvedTime = `${parts.hour}:${parts.minute}`;
  if (resolvedDate !== date || resolvedTime !== time) {
    throw new MedicationAdministrationInputError(
      'The requested administration time does not exist in the organization timezone',
    );
  }
  return resolved.toISOString();
}

export class MedicationAdministrationService implements MedicationAdministrationServiceApi {
  private readonly membership;

  constructor(
    private readonly store: MedicationAdministrationStore,
    private readonly encryption: HealthEncryptionProvider,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private context(requestId: string) {
    return {
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
    };
  }

  private orderSubject(camperId: string, orderId: string): string {
    return `${camperId}:medication-order:${orderId}`;
  }

  private administrationSubject(
    camperId: string,
    orderId: string,
    administrationId: string,
  ): string {
    return `${this.orderSubject(camperId, orderId)}:administration:${administrationId}`;
  }

  private async authorize(action: string, targetId: string, requestId: string): Promise<void> {
    const hasRole = this.membership?.roles.some((role) => authorizedRoles.has(role)) ?? false;
    if (hasRole && this.identity.mfaVerified) return;
    await this.store.recordAudit(this.context(requestId), action, targetId, 'denied', {
      mfa_verified: this.identity.mfaVerified,
    });
    throw new MedicationAdministrationAuthorizationError(
      'Medication records require health staff or administrator access with MFA',
    );
  }

  private decryptOrder(record: EncryptedMedicationOrderRecord): MedicationOrder {
    try {
      const payload = this.encryption.decrypt<MedicationOrderPayload>(
        this.organizationId,
        this.orderSubject(record.camper_id, record.id),
        {
          authenticationTag: record.authentication_tag,
          ciphertext: record.encrypted_payload,
          keyVersion: record.key_version,
          nonce: record.encryption_nonce,
        },
      );
      return {
        administration_times: payload.administration_times,
        camper_id: record.camper_id,
        camper_name: record.camper_name,
        created_at: record.created_at,
        discontinued_at: record.discontinued_at,
        dose: payload.dose,
        ends_on: record.ends_on,
        id: record.id,
        instructions: payload.instructions,
        medication_name: payload.medication_name,
        schedule_type: record.schedule_type,
        session_id: record.session_id,
        session_name: record.session_name,
        starts_on: record.starts_on,
        status: record.status,
        version: record.version,
      };
    } catch {
      throw new MedicationAdministrationEncryptionError(
        'The protected medication order could not be decrypted',
      );
    }
  }

  private decryptAdministration(
    record: EncryptedMedicationAdministrationRecord,
  ): MedicationAdministration {
    try {
      const payload = this.encryption.decrypt<MedicationAdministrationPayload>(
        this.organizationId,
        this.administrationSubject(record.camper_id, record.order_id, record.id),
        {
          authenticationTag: record.authentication_tag,
          ciphertext: record.encrypted_payload,
          keyVersion: record.key_version,
          nonce: record.encryption_nonce,
        },
      );
      return {
        administered_at: record.administered_at,
        administered_by: record.administered_by,
        id: record.id,
        note: payload.note,
        order_id: record.order_id,
        outcome: record.outcome,
        scheduled_for: record.scheduled_for,
      };
    } catch {
      throw new MedicationAdministrationEncryptionError(
        'A protected medication administration could not be decrypted',
      );
    }
  }

  private async loadOrder(orderId: string): Promise<MedicationOrder> {
    const record = await this.store.getOrder(this.organizationId, orderId);
    if (!record) {
      throw new MedicationAdministrationNotFoundError('Medication order not found');
    }
    return this.decryptOrder(record);
  }

  async getCenter(
    query: MedicationAdministrationQuery,
    requestId: string,
  ): Promise<MedicationAdministrationCenter> {
    await this.authorize(
      'health.medication_administration_center_viewed',
      this.organizationId,
      requestId,
    );
    const timezone = await this.store.getOrganizationTimezone(this.organizationId);
    const date = query.date ?? localDate(new Date(), timezone);
    if (!validLocalDate(date)) {
      throw new MedicationAdministrationInputError('Select a valid administration date');
    }
    const startsAt = utcForLocal(date, '00:00', timezone);
    const endsAt = utcForLocal(nextDate(date), '00:00', timezone);
    try {
      const [candidates, encryptedOrders, encryptedAdministrations] = await Promise.all([
        this.store.listCandidates(this.organizationId),
        this.store.listOrders(this.organizationId, date, query.session_id),
        this.store.listAdministrations(this.organizationId, startsAt, endsAt, query.session_id),
      ]);
      const orders = encryptedOrders.map((record) => this.decryptOrder(record));
      const administrations = encryptedAdministrations.map((record) =>
        this.decryptAdministration(record),
      );
      const administrationBySlot = new Map(
        administrations
          .filter((administration) => administration.scheduled_for)
          .map((administration) => [
            `${administration.order_id}|${administration.scheduled_for}`,
            administration,
          ]),
      );
      const scheduledDoses: MedicationScheduledDose[] = orders
        .filter((order) => order.schedule_type === 'SCHEDULED' && order.status === 'ACTIVE')
        .flatMap((order) =>
          order.administration_times.map((time) => {
            const scheduledFor = utcForLocal(date, time, timezone);
            return {
              administration: administrationBySlot.get(`${order.id}|${scheduledFor}`) ?? null,
              order_id: order.id,
              scheduled_for: scheduledFor,
            };
          }),
        )
        .sort((left, right) => left.scheduled_for.localeCompare(right.scheduled_for));
      await this.store.recordAudit(
        this.context(requestId),
        'health.medication_administration_center_viewed',
        this.organizationId,
        'success',
        {
          administration_count: administrations.length,
          date,
          order_count: orders.length,
          session_filtered: Boolean(query.session_id),
        },
      );
      return {
        administrations,
        candidates,
        date,
        orders,
        scheduled_doses: scheduledDoses,
        timezone,
      };
    } catch (error) {
      if (error instanceof MedicationAdministrationEncryptionError) {
        await this.store.recordAudit(
          this.context(requestId),
          'health.medication_administration_center_viewed',
          this.organizationId,
          'failure',
        );
      }
      throw error;
    }
  }

  async createOrder(input: MedicationOrderCreate, requestId: string): Promise<MedicationOrder> {
    await this.authorize('health.medication_order_created', input.camper_id, requestId);
    const medicationName = input.medication_name.trim();
    const dose = input.dose.trim();
    if (!medicationName || !dose) {
      throw new MedicationAdministrationInputError('Medication name and dose cannot be blank');
    }
    if (!validLocalDate(input.starts_on) || !validLocalDate(input.ends_on)) {
      throw new MedicationAdministrationInputError('Select a valid medication order date range');
    }
    if (input.ends_on < input.starts_on) {
      throw new MedicationAdministrationInputError('The end date cannot precede the start date');
    }
    const rangeDays =
      (Date.parse(`${input.ends_on}T00:00:00Z`) - Date.parse(`${input.starts_on}T00:00:00Z`)) /
      86_400_000;
    if (rangeDays > 366) {
      throw new MedicationAdministrationInputError(
        'Medication orders cannot span more than 367 days',
      );
    }
    const times = [...new Set(input.administration_times)].sort();
    if (times.some((time) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      throw new MedicationAdministrationInputError('Select valid administration times');
    }
    if (input.schedule_type === 'SCHEDULED' && times.length === 0) {
      throw new MedicationAdministrationInputError(
        'Scheduled medication orders require at least one administration time',
      );
    }
    if (input.schedule_type === 'PRN' && times.length > 0) {
      throw new MedicationAdministrationInputError(
        'As-needed medication orders cannot include scheduled administration times',
      );
    }
    const id = randomUUID();
    const encrypted = this.encryption.encrypt(
      this.organizationId,
      this.orderSubject(input.camper_id, id),
      {
        administration_times: times,
        dose,
        instructions: input.instructions.trim(),
        medication_name: medicationName,
      } satisfies MedicationOrderPayload,
    );
    await this.store.createOrder(this.context(requestId), {
      authentication_tag: encrypted.authenticationTag,
      camper_id: input.camper_id,
      encrypted_payload: encrypted.ciphertext,
      encryption_nonce: encrypted.nonce,
      ends_on: input.ends_on,
      id,
      key_version: encrypted.keyVersion,
      schedule_type: input.schedule_type,
      session_id: input.session_id,
      starts_on: input.starts_on,
    });
    return this.loadOrder(id);
  }

  async recordAdministration(
    orderId: string,
    input: MedicationAdministrationCreate,
    requestId: string,
  ): Promise<MedicationAdministration> {
    await this.authorize('health.medication_administration_recorded', orderId, requestId);
    const order = await this.loadOrder(orderId);
    if (order.status !== 'ACTIVE') {
      throw new MedicationAdministrationInputError(
        'Discontinued medication orders cannot receive administrations',
      );
    }
    const administeredAt = new Date(input.administered_at);
    if (!Number.isFinite(administeredAt.getTime())) {
      throw new MedicationAdministrationInputError('Select a valid administration time');
    }
    if (administeredAt.getTime() > Date.now() + 5 * 60_000) {
      throw new MedicationAdministrationInputError('Administration time cannot be in the future');
    }
    const note = input.note.trim();
    if (input.outcome !== 'GIVEN' && !note) {
      throw new MedicationAdministrationInputError(
        'A note is required when a medication was not given',
      );
    }
    const timezone = await this.store.getOrganizationTimezone(this.organizationId);
    const administeredDate = localDate(administeredAt, timezone);
    if (administeredDate < order.starts_on || administeredDate > order.ends_on) {
      throw new MedicationAdministrationInputError(
        'The administration time is outside this medication order date range',
      );
    }
    let scheduledFor: string | null = null;
    if (order.schedule_type === 'SCHEDULED') {
      if (!input.scheduled_for) {
        throw new MedicationAdministrationInputError('Select the scheduled dose being recorded');
      }
      const selectedSlot = new Date(input.scheduled_for);
      if (!Number.isFinite(selectedSlot.getTime())) {
        throw new MedicationAdministrationInputError('Select a valid scheduled dose');
      }
      scheduledFor = selectedSlot.toISOString();
      const scheduledDate = localDate(new Date(scheduledFor), timezone);
      const validSlots = order.administration_times.map((time) =>
        utcForLocal(scheduledDate, time, timezone),
      );
      if (
        scheduledDate < order.starts_on ||
        scheduledDate > order.ends_on ||
        !validSlots.includes(scheduledFor)
      ) {
        throw new MedicationAdministrationInputError(
          'The selected time is not part of this medication order',
        );
      }
    } else if (input.scheduled_for) {
      throw new MedicationAdministrationInputError(
        'As-needed administrations cannot reference a scheduled dose',
      );
    }

    const id = randomUUID();
    const encrypted = this.encryption.encrypt(
      this.organizationId,
      this.administrationSubject(order.camper_id, order.id, id),
      { note } satisfies MedicationAdministrationPayload,
    );
    await this.store.recordAdministration(this.context(requestId), orderId, {
      administered_at: input.administered_at,
      authentication_tag: encrypted.authenticationTag,
      encrypted_payload: encrypted.ciphertext,
      encryption_nonce: encrypted.nonce,
      id,
      key_version: encrypted.keyVersion,
      outcome: input.outcome,
      scheduled_for: scheduledFor,
    });
    return {
      administered_at: input.administered_at,
      administered_by: this.identity.subject,
      id,
      note,
      order_id: orderId,
      outcome: input.outcome,
      scheduled_for: scheduledFor,
    };
  }

  async discontinueOrder(
    orderId: string,
    version: number,
    requestId: string,
  ): Promise<MedicationOrder> {
    await this.authorize('health.medication_order_discontinued', orderId, requestId);
    await this.store.discontinue(this.context(requestId), orderId, version);
    return this.loadOrder(orderId);
  }
}
