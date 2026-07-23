import { ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

import { AccountSecurityWorkspace } from '../../../components/account-security-workspace';
import { getAuthSession, getAuthSessions } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function AccountSecurityPage() {
  const session = await getAuthSession();
  if (!session) redirect('/sign-in');
  const sessions = await getAuthSessions();
  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Account</p>
          <h1>Security and sessions</h1>
          <p className="pageDescription">
            Review authentication assurance, organization access, and signed-in devices.
          </p>
        </div>
        <ShieldCheck aria-hidden="true" size={24} />
      </header>
      <AccountSecurityWorkspace initialSession={session} initialSessions={sessions} />
    </>
  );
}
