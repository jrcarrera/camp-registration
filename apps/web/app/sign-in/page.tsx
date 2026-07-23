import { TentTree } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { AuthChallengeForm } from '../../components/auth-challenge-form';

export default function SignInPage() {
  return (
    <section className="authPage">
      <header className="authHeader">
        <span className="brandMark" aria-hidden="true">
          <TentTree size={24} />
        </span>
        <p className="contextLabel">Camp Registration</p>
        <h1>Sign in</h1>
        <p>Parents use an email code. Staff continue with their password and authenticator.</p>
      </header>
      <Suspense fallback={<div className="authCard">Loading sign-in…</div>}>
        <AuthChallengeForm />
      </Suspense>
      <Link className="authRecoveryLink" href="/recover-account">
        Forgot your password or need a new email code?
      </Link>
    </section>
  );
}
