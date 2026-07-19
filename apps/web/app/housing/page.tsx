import { AlertCircle } from 'lucide-react';

import { HousingWorkspace } from '../../components/housing-workspace';
import { getHousing, getSessionHousing, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function HousingPage() {
  try {
    const sessions = await getSessions();
    const active = sessions.sessions.filter(
      (session) => !['ARCHIVED', 'CANCELLED'].includes(session.status),
    );
    const selected = active[0];
    const [inventory, housing] = await Promise.all([
      getHousing(),
      selected ? getSessionHousing(selected.id) : Promise.resolve(null),
    ]);
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Camp operations</p>
            <h1>Camper housing</h1>
            <p className="pageDescription">
              Build bed inventory, dedicate buildings to sessions, and place campers by age and
              bunk-buddy requests.
            </p>
          </div>
        </header>
        <HousingWorkspace initialHousing={housing} initialInventory={inventory} sessions={active} />
      </>
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle size={18} /> Housing data could not be loaded.
      </div>
    );
  }
}
