import { Settings } from 'lucide-react';

import { OrganizationSettingsForm } from '../../components/organization-settings-form';
import { getCatalog } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const catalog = await getCatalog();

  return (
    <>
      <header className="pageHeader settingsPageHeader">
        <div>
          <p className="contextLabel">{catalog.organization.name}</p>
          <h1>Settings</h1>
          <p className="pageDescription">
            Configure tenant-owned defaults used by camp operations.
          </p>
        </div>
        <span className="settingsHeaderIcon" aria-hidden="true">
          <Settings size={20} />
        </span>
      </header>
      <OrganizationSettingsForm organization={catalog.organization} />
    </>
  );
}
