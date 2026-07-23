import { MailCheck } from 'lucide-react';
import { Suspense } from 'react';

import { AuthChallengeForm } from '../../components/auth-challenge-form';

export default function AcceptInvitePage() {
  return (
    <section className="authPage">
      <header className="authHeader">
        <MailCheck aria-hidden="true" size={28} />
        <p className="contextLabel">Account invitation</p>
        <h1>Accept your invitation</h1>
        <p>Use the same email address that received the invitation.</p>
      </header>
      <Suspense fallback={<div className="authCard">Loading invitation…</div>}>
        <AuthChallengeForm intent="ACCEPT_INVITATION" returnTo="/" />
      </Suspense>
    </section>
  );
}
