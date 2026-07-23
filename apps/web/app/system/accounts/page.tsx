import { ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

import { SystemAccountWorkspace } from '../../../components/system-account-workspace';
import { getAuthSession } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SystemAccountsPage() {
  const session = await getAuthSession();
  if (!session) redirect('/sign-in');
  if (session.platform_role !== 'system_admin') redirect('/account/security');

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">System administration</p>
          <h1>Accounts and recovery</h1>
          <p className="pageDescription">
            Suspend global accounts, perform exceptional recovery, and invite organization
            administrators.
          </p>
        </div>
        <ShieldCheck aria-hidden="true" size={24} />
      </header>
      <SystemAccountWorkspace currentAccountId={session.account_id} />
    </>
  );
}
