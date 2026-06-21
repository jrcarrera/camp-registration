import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  Settings,
  TentTree,
  Users,
} from 'lucide-react';

const navigation = [
  { href: '#overview', icon: ClipboardList, label: 'Overview' },
  { href: '#sessions', icon: CalendarDays, label: 'Sessions' },
  { href: '#campers', icon: Users, label: 'Campers' },
  { href: '#health', icon: HeartPulse, label: 'Health' },
];

const metrics = [
  { label: 'Registered campers', tone: 'green', value: '0' },
  { label: 'Open sessions', tone: 'blue', value: '0' },
  { label: 'Forms incomplete', tone: 'amber', value: '0' },
  { label: 'Balances due', tone: 'coral', value: '$0' },
];

export default function HomePage() {
  return (
    <div className="appShell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Camp Registration overview">
          <span className="brandMark" aria-hidden="true">
            <TentTree size={22} strokeWidth={2} />
          </span>
          <span>
            <strong>Camp Registration</strong>
            <small>Operations</small>
          </span>
        </a>

        <nav aria-label="Primary navigation">
          {navigation.map(({ href, icon: Icon, label }, index) => (
            <a
              key={href}
              className="navLink"
              href={href}
              aria-current={index === 0 ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <a className="navLink settingsLink" href="#settings">
          <Settings size={18} aria-hidden="true" />
          <span>Settings</span>
        </a>
      </aside>

      <main className="workspace" id="overview">
        <header className="topbar">
          <div>
            <p className="contextLabel">Organization workspace</p>
            <h1>Camp Registration</h1>
          </div>
          <label className="seasonControl">
            <span>Season</span>
            <select defaultValue="summer-2026" aria-label="Active season">
              <option value="summer-2026">Summer 2026</option>
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

        <section className="contentSection" id="sessions">
          <div className="sectionHeading">
            <div>
              <p className="contextLabel">Current season</p>
              <h2>Sessions</h2>
            </div>
            <div className="systemStatus" role="status">
              <CheckCircle2 size={17} aria-hidden="true" />
              Local system ready
            </div>
          </div>

          <div className="tableFrame">
            <table className="sessionsTable sessionsTableEmpty">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Capacity</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="emptyState" colSpan={5}>
                    <CalendarDays size={24} aria-hidden="true" />
                    <strong>No sessions yet</strong>
                    <span>Session setup will be the first registration workflow.</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="operationalGrid" aria-label="Operational queues">
          <div className="queueSection" id="campers">
            <p className="contextLabel">Enrollment</p>
            <h2>Registration queue</h2>
            <p>No registrations require review.</p>
          </div>
          <div className="queueSection" id="health">
            <p className="contextLabel">Restricted access</p>
            <h2>Health forms</h2>
            <p>No health forms require review.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
