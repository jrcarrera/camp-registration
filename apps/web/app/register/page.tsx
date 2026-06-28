import { AlertCircle } from 'lucide-react';

import { RegistrationCheckoutClient } from '../../components/registration-checkout-client';
import { getFamilies, getSession, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function RegistrationCheckoutPage() {
  const [familiesResult, sessionsResult] = await Promise.allSettled([getFamilies(), getSessions()]);
  const families = familiesResult.status === 'fulfilled' ? familiesResult.value.families : [];
  const sessionSummaries =
    sessionsResult.status === 'fulfilled' ? sessionsResult.value.sessions : [];
  const sessionDetailResults = await Promise.allSettled(
    sessionSummaries.map((session) => getSession(session.id)),
  );
  const sessions = sessionDetailResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const loadError = familiesResult.status === 'rejected' || sessionsResult.status === 'rejected';

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Registration</p>
          <h1>Register for camp</h1>
          <p className="pageDescription">Choose a camper and session.</p>
        </div>
      </header>

      {loadError && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          Registration data could not be loaded.
        </div>
      )}

      <section className="contentSection registrationCheckout" aria-label="Registration checkout">
        <RegistrationCheckoutClient families={families} sessions={sessions} />
      </section>
    </>
  );
}
