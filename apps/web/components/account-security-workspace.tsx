'use client';

import type {
  AuthChallenge,
  AuthSession,
  AuthSessionList,
  ProblemResponse,
} from '@camp-registration/contracts';
import { AtSign, LogOut, MonitorSmartphone, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function AccountSecurityWorkspace({
  initialSession,
  initialSessions,
}: {
  initialSession: AuthSession;
  initialSessions: AuthSessionList;
}) {
  const [sessions, setSessions] = useState(initialSessions.sessions);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nextEmail, setNextEmail] = useState('');
  const [emailChallenge, setEmailChallenge] = useState<AuthChallenge | null>(null);
  const [emailCode, setEmailCode] = useState('');

  async function selectOrganization(organizationId: string) {
    setWorking(true);
    const response = await fetch('/api/v1/auth/session/organization', {
      body: JSON.stringify({ organization_id: organizationId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    setWorking(false);
    if (response.ok) window.location.assign('/');
    else {
      const problem = (await response.json()) as ProblemResponse;
      setMessage(problem.message);
    }
  }

  async function revoke(sessionId: string) {
    setWorking(true);
    const response = await fetch(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    setWorking(false);
    if (response.ok) {
      const current = sessions.find((session) => session.id === sessionId)?.current;
      if (current) window.location.assign('/sign-in');
      else setSessions((items) => items.filter((item) => item.id !== sessionId));
    }
  }

  async function logout() {
    setWorking(true);
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    window.location.assign('/sign-in');
  }

  async function revokeOthers() {
    setWorking(true);
    setMessage(null);
    const response = await fetch('/api/v1/auth/sessions', { method: 'DELETE' });
    setWorking(false);
    if (response.ok) {
      setSessions((items) => items.filter((item) => item.current));
      setMessage('Other sessions revoked.');
    } else {
      setMessage(((await response.json()) as ProblemResponse).message);
    }
  }

  async function startEmailChange() {
    setWorking(true);
    setMessage(null);
    const response = await fetch('/api/v1/auth/email-change', {
      body: JSON.stringify({ email: nextEmail }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    setWorking(false);
    if (response.ok) {
      setEmailChallenge((await response.json()) as AuthChallenge);
      setMessage('Verification code sent to the new email address.');
    } else {
      setMessage(((await response.json()) as ProblemResponse).message);
    }
  }

  async function completeEmailChange() {
    if (!emailChallenge) return;
    setWorking(true);
    setMessage(null);
    const response = await fetch(
      `/api/v1/auth/email-change/${encodeURIComponent(emailChallenge.challenge_id)}/respond`,
      {
        body: JSON.stringify({ response: emailCode, step: 'EMAIL_OTP' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    setWorking(false);
    if (response.ok) window.location.reload();
    else setMessage(((await response.json()) as ProblemResponse).message);
  }

  return (
    <div className="identityStack">
      {message ? <div className="notice noticeError">{message}</div> : null}
      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Account assurance</h2>
          <p>Your login account remains separate from family contact information.</p>
        </div>
        <div className="securitySummary">
          <ShieldCheck aria-hidden="true" size={22} />
          <div>
            <strong>{initialSession.email}</strong>
            <p>
              {initialSession.authentication_method === 'PASSWORD_TOTP'
                ? 'Password and authenticator'
                : 'Verified email code'}
              {' · '}
              {initialSession.mfa_verified ? 'MFA verified' : 'No privileged MFA assurance'}
            </p>
          </div>
        </div>
      </section>
      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Login email</h2>
          <p>Verify a new login address. Family contact email is never changed automatically.</p>
        </div>
        <div className="identityInlineForm">
          <AtSign aria-hidden="true" size={19} />
          <label>
            New email address
            <input
              autoComplete="email"
              disabled={working || Boolean(emailChallenge)}
              onChange={(event) => setNextEmail(event.target.value)}
              type="email"
              value={nextEmail}
            />
          </label>
          {emailChallenge ? (
            <>
              <label>
                Verification code
                <input
                  autoComplete="one-time-code"
                  disabled={working}
                  inputMode="numeric"
                  onChange={(event) => setEmailCode(event.target.value)}
                  value={emailCode}
                />
              </label>
              <button
                className="buttonSecondary"
                disabled={working || !emailCode}
                onClick={() => void completeEmailChange()}
                type="button"
              >
                Verify new email
              </button>
            </>
          ) : (
            <button
              className="buttonSecondary"
              disabled={working || !nextEmail}
              onClick={() => void startEmailChange()}
              type="button"
            >
              Send verification code
            </button>
          )}
        </div>
      </section>
      {initialSession.organizations.length > 1 ? (
        <section className="editorSection">
          <div className="editorSectionHeading">
            <h2>Active organization</h2>
            <p>Switching changes the tenant context for all camp operations.</p>
          </div>
          <select
            disabled={working}
            onChange={(event) => void selectOrganization(event.target.value)}
            value={initialSession.active_organization_id ?? ''}
          >
            {initialSession.organizations.map((organization) => (
              <option key={organization.organization_id} value={organization.organization_id}>
                {organization.name}
              </option>
            ))}
          </select>
        </section>
      ) : null}
      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Sessions</h2>
          <p>Revoke devices you no longer recognize or use.</p>
        </div>
        <div className="identityList">
          {sessions.map((session) => (
            <div className="identityListRow" key={session.id}>
              <MonitorSmartphone aria-hidden="true" size={19} />
              <div>
                <strong>{session.current ? 'Current session' : 'Signed-in session'}</strong>
                <small>Last used {new Date(session.last_seen_at).toLocaleString()}</small>
              </div>
              <button
                aria-label={`Revoke ${session.current ? 'current' : 'other'} session`}
                className="buttonSecondary"
                disabled={working}
                onClick={() => void revoke(session.id)}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} />
                Revoke
              </button>
            </div>
          ))}
        </div>
        {sessions.some((session) => !session.current && !session.revoked_at) ? (
          <button
            className="buttonSecondary"
            disabled={working}
            onClick={() => void revokeOthers()}
            type="button"
          >
            Revoke all other sessions
          </button>
        ) : null}
      </section>
      <button className="buttonSecondary" disabled={working} onClick={() => void logout()}>
        <LogOut aria-hidden="true" size={17} />
        Sign out
      </button>
    </div>
  );
}
