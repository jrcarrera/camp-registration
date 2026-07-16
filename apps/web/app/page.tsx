import type {
  RegisteredCamper,
  SessionDetail,
  SessionSummary,
  WaitlistOperationsStatus,
} from '@camp-registration/contracts';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  Hourglass,
} from 'lucide-react';

import { SessionTable } from '../components/session-table';
import { getCatalog, getSession, getSessions, getWaitlistOperations } from '../lib/api';

export const dynamic = 'force-dynamic';

interface RegistrationActivity extends RegisteredCamper {
  session_id: string;
  session_name: string;
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone,
    timeStyle: 'short',
  }).format(new Date(value));
}

function automationLabel(status: WaitlistOperationsStatus | null): string {
  if (!status) return 'Unavailable';
  const labels: Record<WaitlistOperationsStatus['health'], string> = {
    DEGRADED: 'Needs attention',
    HEALTHY: 'Healthy',
    NOT_RUNNING: 'Not running',
    STALE: 'Delayed',
  };
  return labels[status.health];
}

function camperName(camper: Pick<RegisteredCamper, 'first_name' | 'last_name' | 'preferred_name'>) {
  return `${camper.preferred_name ?? camper.first_name} ${camper.last_name}`;
}

function sessionFillRate(session: SessionSummary): number {
  return session.capacity > 0 ? (session.registered_count / session.capacity) * 100 : 0;
}

function registrationActivity(sessions: SessionDetail[]): RegistrationActivity[] {
  return sessions.flatMap((session) =>
    session.registered_campers.map((camper) => ({
      ...camper,
      session_id: session.id,
      session_name: session.name,
    })),
  );
}

export default async function HomePage() {
  let sessions: SessionSummary[] = [];
  let sessionDetails: SessionDetail[] = [];
  let seasonName = 'Summer 2027';
  let organizationTimeZone = 'UTC';
  let loadError = false;
  let waitlistOperations: WaitlistOperationsStatus | null = null;

  try {
    const [catalog, response] = await Promise.all([getCatalog(), getSessions()]);
    sessions = response.sessions;
    seasonName = catalog.seasons[0]?.name ?? seasonName;
    organizationTimeZone = catalog.organization.timezone;
    sessionDetails = await Promise.all(sessions.map((session) => getSession(session.id)));
  } catch {
    loadError = true;
  }

  try {
    waitlistOperations = await getWaitlistOperations();
  } catch {
    waitlistOperations = null;
  }

  const activeSessions = sessions.filter(
    (session) => session.status !== 'CANCELLED' && session.status !== 'ARCHIVED',
  );
  const registrations = registrationActivity(sessionDetails);
  const confirmedRegistrations = registrations.filter(
    (registration) => registration.status === 'CONFIRMED',
  );
  const totalCapacity = activeSessions.reduce((total, session) => total + session.capacity, 0);
  const registeredCount = activeSessions.reduce(
    (total, session) => total + session.registered_count,
    0,
  );
  const waitlistedCount = activeSessions.reduce(
    (total, session) => total + session.waitlisted_count,
    0,
  );
  const availableCount = activeSessions.reduce(
    (total, session) => total + session.available_count,
    0,
  );
  const balanceDueCents = confirmedRegistrations.reduce(
    (total, registration) => total + registration.balance_due_cents,
    0,
  );
  const fillRate = totalCapacity > 0 ? (registeredCount / totalCapacity) * 100 : 0;
  const balanceFollowUps = confirmedRegistrations
    .filter((registration) => registration.balance_due_cents > 0)
    .sort((a, b) => b.balance_due_cents - a.balance_due_cents)
    .slice(0, 5);
  const waitlistOpenings = activeSessions
    .filter((session) => session.waitlisted_count > 0 && session.available_count > 0)
    .sort((a, b) => b.waitlisted_count - a.waitlisted_count)
    .slice(0, 5);
  const capacityRisks = activeSessions
    .filter((session) => session.registered_count >= session.capacity * 0.9)
    .sort((a, b) => sessionFillRate(b) - sessionFillRate(a))
    .slice(0, 5);
  const recentRegistrations = [...registrations]
    .sort((a, b) => Date.parse(b.registered_at) - Date.parse(a.registered_at))
    .slice(0, 5);
  const metrics = [
    {
      label: 'Registered campers',
      tone: 'green',
      value: String(registeredCount),
    },
    {
      label: 'Open seats',
      tone: 'blue',
      value: String(availableCount),
    },
    { label: 'Waitlisted campers', tone: 'amber', value: String(waitlistedCount) },
    { label: 'Balances due', tone: 'coral', value: money(balanceDueCents) },
  ];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="contextLabel">Organization workspace</p>
          <h1>Camp Registration</h1>
        </div>
        <label className="seasonControl">
          <span>Season</span>
          <select defaultValue="active" aria-label="Active season">
            <option value="active">{seasonName}</option>
          </select>
        </label>
      </header>

      <section className="metricStrip" aria-label="Registration summary">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <span className={`metricAccent ${metric.tone}`} aria-hidden="true" />
            <div>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="operationalGrid" aria-label="Operational dashboard">
        <div className="queueSection queueSectionOperations">
          <div className="queueHeader operationsHeader">
            <span aria-hidden="true">
              <Activity size={18} />
            </span>
            <div>
              <p className="contextLabel">Automation</p>
              <h2>Waitlist operations</h2>
            </div>
            <strong
              className={`operationsBadge operationsBadge${waitlistOperations?.health ?? 'UNKNOWN'}`}
            >
              {automationLabel(waitlistOperations)}
            </strong>
          </div>
          {waitlistOperations ? (
            <ul className="operationsMetrics" aria-label="Waitlist automation status">
              <li>
                <span>Last completed cycle</span>
                <strong>
                  {formatTimestamp(waitlistOperations.last_completed_at, organizationTimeZone)}
                </strong>
              </li>
              <li>
                <span>Pending deliveries</span>
                <strong>{waitlistOperations.pending_delivery_count}</strong>
              </li>
              <li>
                <span>Failed deliveries</span>
                <strong>{waitlistOperations.failed_delivery_count}</strong>
              </li>
              <li>
                <span>Expired offers awaiting processing</span>
                <strong>{waitlistOperations.expired_offer_count}</strong>
              </li>
            </ul>
          ) : (
            <p className="queueEmpty">
              Waitlist automation health could not be loaded. Registration data remains available.
            </p>
          )}
        </div>

        <div className="queueSection">
          <div className="queueHeader">
            <span aria-hidden="true">
              <CircleDollarSign size={18} />
            </span>
            <div>
              <p className="contextLabel">Payments</p>
              <h2>Balance follow-up</h2>
            </div>
          </div>
          {balanceFollowUps.length > 0 ? (
            <ul className="queueList">
              {balanceFollowUps.map((registration) => (
                <li className="queueItem" key={registration.registration_id}>
                  <div>
                    <strong>{camperName(registration)}</strong>
                    <span>
                      {registration.family_name} · {registration.session_name}
                    </span>
                  </div>
                  <strong className="queueValue">{money(registration.balance_due_cents)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="queueEmpty">No confirmed balances require follow-up.</p>
          )}
        </div>

        <div className="queueSection" id="campers">
          <div className="queueHeader">
            <span aria-hidden="true">
              <Hourglass size={18} />
            </span>
            <div>
              <p className="contextLabel">Waitlist</p>
              <h2>Open capacity</h2>
            </div>
          </div>
          {waitlistOpenings.length > 0 ? (
            <ul className="queueList">
              {waitlistOpenings.map((session) => (
                <li className="queueItem" key={session.id}>
                  <div>
                    <strong>{session.name}</strong>
                    <span>
                      {session.waitlisted_count} waiting · {session.available_count} open
                    </span>
                  </div>
                  <strong className="queueValue">{session.code}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="queueEmpty">No waitlisted sessions have open seats.</p>
          )}
        </div>

        <div className="queueSection">
          <div className="queueHeader">
            <span aria-hidden="true">
              <Gauge size={18} />
            </span>
            <div>
              <p className="contextLabel">Capacity</p>
              <h2>Fill-rate watch</h2>
            </div>
          </div>
          {capacityRisks.length > 0 ? (
            <ul className="queueList">
              {capacityRisks.map((session) => (
                <li className="queueItem" key={session.id}>
                  <div>
                    <strong>{session.name}</strong>
                    <span>
                      {session.registered_count} of {session.capacity} filled ·{' '}
                      {session.waitlisted_count} waiting
                    </span>
                  </div>
                  <strong className="queueValue">{percent(sessionFillRate(session))}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="queueEmpty">No active sessions are within 10% of capacity.</p>
          )}
        </div>

        <div className="queueSection">
          <div className="queueHeader">
            <span aria-hidden="true">
              <ClipboardList size={18} />
            </span>
            <div>
              <p className="contextLabel">Activity</p>
              <h2>Recent registrations</h2>
            </div>
          </div>
          {recentRegistrations.length > 0 ? (
            <ul className="queueList">
              {recentRegistrations.map((registration) => (
                <li className="queueItem" key={registration.registration_id}>
                  <div>
                    <strong>{camperName(registration)}</strong>
                    <span>
                      {registration.session_name} ·{' '}
                      {registration.status === 'CONFIRMED' ? 'Attending' : 'Waitlisted'}
                    </span>
                  </div>
                  <strong className="queueValue">{formatDate(registration.registered_at)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="queueEmpty">No registrations have been recorded yet.</p>
          )}
        </div>
      </section>

      <section className="contentSection" id="sessions">
        <div className="sectionHeading">
          <div>
            <p className="contextLabel">Current season</p>
            <h2>Sessions</h2>
            <p className="sectionDescription">
              {percent(fillRate)} filled across {totalCapacity} active spaces.
            </p>
          </div>
          <div className={`systemStatus${loadError ? ' systemStatusError' : ''}`} role="status">
            {loadError ? (
              <>
                <AlertCircle size={17} aria-hidden="true" />
                Session data unavailable
              </>
            ) : (
              <>
                <CheckCircle2 size={17} aria-hidden="true" />
                Local system ready
              </>
            )}
          </div>
        </div>

        <SessionTable sessions={sessions} />
      </section>
    </>
  );
}
