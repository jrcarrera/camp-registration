import { WorkforceAdministrationWorkspace } from '../../components/workforce-administration-workspace';
import { getSessions, getWorkforce } from '../../lib/api';

export default async function WorkforcePage() {
  const [workforce, sessions] = await Promise.all([getWorkforce(), getSessions()]);
  return <WorkforceAdministrationWorkspace initial={workforce} sessions={sessions.sessions} />;
}
