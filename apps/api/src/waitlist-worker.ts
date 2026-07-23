import { randomUUID } from 'node:crypto';

import {
  createDatabaseClient,
  CommunicationsStore,
  FamilyStore,
  NotificationStore,
  WaitlistOperationsStore,
} from '@camp-registration/database';

import { SmtpEmailSender } from './notifications/email.js';
import { WaitlistWorker, type WaitlistWorkerLogger } from './waitlist/worker.js';

function integerSetting(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const logger: WaitlistWorkerLogger = {
  error(data, message) {
    process.stderr.write(`${JSON.stringify({ level: 'error', message, ...data })}\n`);
  },
  info(data, message) {
    process.stdout.write(`${JSON.stringify({ level: 'info', message, ...data })}\n`);
  },
};

const database = createDatabaseClient({ connectionString: requiredSetting('DATABASE_URL') });
const smtpUsername = process.env.SMTP_USERNAME?.trim();
const smtpPassword = process.env.SMTP_PASSWORD;
const emailSender = new SmtpEmailSender({
  from: process.env.SMTP_FROM?.trim() || 'Camp Registration <no-reply@local.camp.test>',
  host: requiredSetting('SMTP_HOST'),
  port: integerSetting('SMTP_PORT', 1025, 1, 65_535),
  secure: process.env.SMTP_SECURE === 'true',
  ...(smtpUsername ? { username: smtpUsername } : {}),
  ...(smtpPassword ? { password: smtpPassword } : {}),
});
const worker = new WaitlistWorker(
  new FamilyStore(database),
  new NotificationStore(database),
  new WaitlistOperationsStore(database),
  emailSender,
  logger,
  {
    batchSize: integerSetting('WAITLIST_WORKER_BATCH_SIZE', 50, 1, 500),
    maximumDeliveryAttempts: integerSetting('NOTIFICATION_MAX_ATTEMPTS', 5, 1, 20),
    portalBaseUrl: process.env.PORTAL_BASE_URL?.trim() || 'http://localhost:3000',
    reminderLeadHours: integerSetting('WAITLIST_REMINDER_LEAD_HOURS', 12, 1, 72),
    workerId: process.env.WAITLIST_WORKER_ID?.trim() || `waitlist-worker:${randomUUID()}`,
  },
  new CommunicationsStore(database),
);
const intervalMs = integerSetting('WAITLIST_WORKER_INTERVAL_MS', 30_000, 5_000, 3_600_000);
let running = false;

const run = async () => {
  if (running) return;
  running = true;
  try {
    await worker.runCycle();
  } catch (error) {
    logger.error(
      { error_type: error instanceof Error ? error.name : 'UnknownError' },
      'waitlist worker cycle aborted',
    );
  } finally {
    running = false;
  }
};

await run();
const interval = setInterval(() => void run(), intervalMs);

const shutdown = async (signal: NodeJS.Signals) => {
  clearInterval(interval);
  logger.info({ signal }, 'waitlist worker shutting down');
  emailSender.close();
  await database.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
