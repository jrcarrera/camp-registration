'use client';

import type {
  IdentityRole,
  MembershipList,
  OnboardingMatchCandidate,
  ProblemResponse,
} from '@camp-registration/contracts';
import { AlertCircle, Check, MailPlus, ShieldOff, UserCheck, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';

const availableRoles: Array<{ label: string; value: IdentityRole }> = [
  { label: 'Camp staff', value: 'camp_staff' },
  { label: 'Health staff', value: 'health_staff' },
  { label: 'Camp admin', value: 'camp_admin' },
];

export function IdentityAdministrationWorkspace({
  initialCenter,
}: {
  initialCenter: MembershipList;
}) {
  const [center, setCenter] = useState(initialCenter);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<IdentityRole>('camp_staff');
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function reload() {
    const response = await fetch('/api/v1/identity/administration');
    if (response.ok) setCenter((await response.json()) as MembershipList);
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setMessage(null);
    const response = await fetch('/api/v1/identity/workforce-invitations', {
      body: JSON.stringify({ email, roles: [role] }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(((await response.json()) as ProblemResponse).message);
      return;
    }
    setEmail('');
    await reload();
  }

  async function decide(
    requestId: string,
    action: 'APPROVE_MATCH' | 'APPROVE_NEW' | 'REJECT' | 'REOPEN',
    match?: OnboardingMatchCandidate,
  ) {
    const reason =
      action === 'REJECT' ? window.prompt('Reason shown to the applicant:')?.trim() : undefined;
    if (action === 'REJECT' && !reason) return;
    setWorking(true);
    const response = await fetch(
      `/api/v1/identity/onboarding/${encodeURIComponent(requestId)}/decision`,
      {
        body: JSON.stringify({
          action,
          ...(match ? { adult_id: match.adult_id, family_id: match.family_id } : {}),
          ...(reason ? { reason } : {}),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    setWorking(false);
    if (!response.ok) setMessage(((await response.json()) as ProblemResponse).message);
    else await reload();
  }

  async function matchExisting(requestId: string) {
    setWorking(true);
    setMessage(null);
    const response = await fetch(
      `/api/v1/identity/onboarding/${encodeURIComponent(requestId)}/matches`,
    );
    setWorking(false);
    if (!response.ok) {
      setMessage(((await response.json()) as ProblemResponse).message);
      return;
    }
    const matches = ((await response.json()) as { matches: OnboardingMatchCandidate[] }).matches;
    if (matches.length === 0) {
      setMessage('No unclaimed adult has the same verified email address.');
      return;
    }
    const match = matches[0]!;
    if (window.confirm(`Match this applicant to ${match.adult_name} in ${match.family_name}?`)) {
      await decide(requestId, 'APPROVE_MATCH', match);
    }
  }

  async function toggleMembership(membership: MembershipList['memberships'][number]) {
    const nextStatus = membership.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const reason = window.prompt(`Reason to mark this membership ${nextStatus.toLowerCase()}:`);
    if (!reason?.trim()) return;
    setWorking(true);
    const response = await fetch(
      `/api/v1/identity/memberships/${encodeURIComponent(membership.id)}`,
      {
        body: JSON.stringify({
          reason,
          roles: membership.roles,
          status: nextStatus,
          version: membership.version,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      },
    );
    setWorking(false);
    if (!response.ok) setMessage(((await response.json()) as ProblemResponse).message);
    else await reload();
  }

  async function revokeInvitation(invitationId: string) {
    setWorking(true);
    const response = await fetch(
      `/api/v1/identity/invitations/${encodeURIComponent(invitationId)}`,
      { method: 'DELETE' },
    );
    setWorking(false);
    if (!response.ok) setMessage(((await response.json()) as ProblemResponse).message);
    else await reload();
  }

  async function resendInvitation(invitationId: string) {
    setWorking(true);
    const response = await fetch(
      `/api/v1/identity/invitations/${encodeURIComponent(invitationId)}/resend`,
      { method: 'POST' },
    );
    setWorking(false);
    if (!response.ok) setMessage(((await response.json()) as ProblemResponse).message);
    else await reload();
  }

  return (
    <div className="identityStack">
      {message ? (
        <div className="notice noticeError" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          {message}
        </div>
      ) : null}
      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Pending family requests</h2>
          <p>Approval creates a family and links the verified applicant as its owner.</p>
        </div>
        <div className="identityList">
          {center.onboarding_requests.length === 0 ? (
            <p className="emptyText">No onboarding requests.</p>
          ) : (
            center.onboarding_requests.map((request) => (
              <div className="identityListRow" key={request.id}>
                <UserCheck aria-hidden="true" size={19} />
                <div>
                  <strong>
                    {request.first_name} {request.last_name}
                  </strong>
                  <small>
                    {request.email} · {request.status.toLowerCase()}
                  </small>
                </div>
                <div className="inlineActions">
                  {request.status === 'PENDING' ? (
                    <>
                      <button
                        className="buttonSecondary"
                        disabled={working}
                        onClick={() => void decide(request.id, 'APPROVE_NEW')}
                        type="button"
                      >
                        <Check aria-hidden="true" size={16} />
                        Approve new
                      </button>
                      <button
                        className="buttonSecondary"
                        disabled={working}
                        onClick={() => void matchExisting(request.id)}
                        type="button"
                      >
                        Match existing
                      </button>
                      <button
                        className="buttonSecondary"
                        disabled={working}
                        onClick={() => void decide(request.id, 'REJECT')}
                        type="button"
                      >
                        <X aria-hidden="true" size={16} />
                        Reject
                      </button>
                    </>
                  ) : request.status === 'REJECTED' ? (
                    <button
                      className="buttonSecondary"
                      disabled={working}
                      onClick={() => void decide(request.id, 'REOPEN')}
                      type="button"
                    >
                      Reopen
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Invite staff</h2>
          <p>New workforce users verify email, set a password, and enroll an authenticator.</p>
        </div>
        <form className="identityInviteForm" onSubmit={invite}>
          <label className="formField">
            <span>Email</span>
            <input
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="formField">
            <span>Role</span>
            <select onChange={(event) => setRole(event.target.value as IdentityRole)} value={role}>
              {availableRoles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="buttonPrimary" disabled={working} type="submit">
            <MailPlus aria-hidden="true" size={17} />
            Send invitation
          </button>
        </form>
      </section>

      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Workforce access</h2>
          <p>Role and status changes are versioned and audited.</p>
        </div>
        <div className="identityList">
          {center.memberships.map((membership) => (
            <div className="identityListRow" key={membership.id}>
              <UserCheck aria-hidden="true" size={19} />
              <div>
                <strong>{membership.email}</strong>
                <small>
                  {membership.roles.join(', ')} · {membership.status.toLowerCase()}
                </small>
              </div>
              <button
                className="buttonSecondary"
                disabled={working}
                onClick={() => void toggleMembership(membership)}
                type="button"
              >
                <ShieldOff aria-hidden="true" size={16} />
                {membership.status === 'ACTIVE' ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Invitation history</h2>
          <p>Pending links expire automatically after seven days.</p>
        </div>
        <div className="identityList">
          {center.invitations.map((invitation) => (
            <div className="identityListRow" key={invitation.id}>
              <MailPlus aria-hidden="true" size={19} />
              <div>
                <strong>{invitation.email_hint}</strong>
                <small>
                  {invitation.invitation_type.toLowerCase()} · {invitation.status.toLowerCase()}
                </small>
              </div>
              {invitation.status === 'PENDING' ? (
                <div className="inlineActions">
                  <button
                    className="buttonSecondary"
                    disabled={working}
                    onClick={() => void resendInvitation(invitation.id)}
                    type="button"
                  >
                    Resend
                  </button>
                  <button
                    className="buttonSecondary"
                    disabled={working}
                    onClick={() => void revokeInvitation(invitation.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
