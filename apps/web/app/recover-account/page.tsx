import { KeyRound } from 'lucide-react';
import { Suspense } from 'react';

import { AuthChallengeForm } from '../../components/auth-challenge-form';

export default function RecoverAccountPage() {
  return (
    <section className="authPage">
      <header className="authHeader">
        <KeyRound aria-hidden="true" size={28} />
        <p className="contextLabel">Account recovery</p>
        <h1>Recover your account</h1>
        <p>
          Parents verify a fresh email code. Staff reset their password, then sign in with their
          authenticator.
        </p>
      </header>
      <Suspense fallback={<div className="authCard">Loading account recovery…</div>}>
        <AuthChallengeForm intent="RECOVER_PASSWORD" />
      </Suspense>
    </section>
  );
}
