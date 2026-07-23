import { UsersRound } from 'lucide-react';

import { IdentityAdministrationWorkspace } from '../../../components/identity-administration-workspace';
import { getIdentityAdministration } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function AccessAdministrationPage() {
  const center = await getIdentityAdministration();
  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Settings</p>
          <h1>Access and onboarding</h1>
          <p className="pageDescription">
            Review family applications, invite staff, and manage organization access.
          </p>
        </div>
        <UsersRound aria-hidden="true" size={24} />
      </header>
      <IdentityAdministrationWorkspace initialCenter={center} />
    </>
  );
}
