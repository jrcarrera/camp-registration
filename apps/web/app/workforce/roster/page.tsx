import { WorkforceSessionRoster } from '../../../components/workforce-session-roster';
import { getSessions } from '../../../lib/api';

export default async function WorkforceRosterPage() {
  const sessions = await getSessions();
  return <WorkforceSessionRoster sessions={sessions.sessions} />;
}
