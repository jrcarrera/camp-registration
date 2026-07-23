import { CheckCircle2, Clock3, ShieldCheck, TentTree } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { AuthChallengeForm } from '../../../../components/auth-challenge-form';
import { OnboardingRequestForm } from '../../../../components/onboarding-request-form';
import { getAuthSession, getOnboarding, getPublicOrganization } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function OrganizationJoinPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const organization = await getPublicOrganization(organizationSlug);
  const session = await getAuthSession();
  const onboarding = session ? await getOnboarding(organizationSlug).catch(() => null) : null;

  return (
    <section className="authPage authPageWide">
      <header className="authHeader">
        <span className="brandMark" aria-hidden="true">
          <TentTree size={24} />
        </span>
        <p className="contextLabel">{organization.name}</p>
        <h1>Request a family account</h1>
        <p>Your email is verified first. Camp staff then reviews the family request.</p>
      </header>

      {!organization.self_service_signup_enabled ? (
        <div className="authCard">
          <ShieldCheck aria-hidden="true" size={24} />
          <h2>Online applications are closed</h2>
          <p>Contact {organization.name} for an invitation.</p>
        </div>
      ) : !session ? (
        <Suspense fallback={<div className="authCard">Loading verification…</div>}>
          <AuthChallengeForm intent="JOIN_ORGANIZATION" organizationSlug={organizationSlug} />
        </Suspense>
      ) : !onboarding ? (
        <OnboardingRequestForm organizationSlug={organizationSlug} />
      ) : onboarding.status === 'PENDING' ? (
        <div className="authCard statusCard">
          <Clock3 aria-hidden="true" size={26} />
          <h2>Request awaiting review</h2>
          <p>
            {organization.name} will review the request for {onboarding.first_name}{' '}
            {onboarding.last_name}. You can return to this page for the current status.
          </p>
        </div>
      ) : onboarding.status === 'APPROVED' ? (
        <div className="authCard statusCard">
          <CheckCircle2 aria-hidden="true" size={26} />
          <h2>Family account approved</h2>
          <p>Your verified account is now linked to the approved family.</p>
          <Link className="buttonPrimary authSubmit" href="/portal">
            Open parent portal
          </Link>
        </div>
      ) : (
        <div className="authCard statusCard">
          <ShieldCheck aria-hidden="true" size={26} />
          <h2>Request not approved</h2>
          <p>{onboarding.decision_reason ?? `Contact ${organization.name} for assistance.`}</p>
        </div>
      )}
    </section>
  );
}
