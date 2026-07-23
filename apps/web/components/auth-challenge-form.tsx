'use client';

import type {
  AuthChallenge,
  AuthIntent,
  AuthSession,
  ProblemResponse,
} from '@camp-registration/contracts';
import { AlertCircle, KeyRound, LogIn } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

interface AuthChallengeFormProps {
  intent?: AuthIntent;
  organizationSlug?: string;
  returnTo?: string;
}

function challengeLabel(step: AuthChallenge['next_step']): string {
  if (step === 'EMAIL_OTP') return 'Email verification code';
  if (step === 'RECOVERY_CODE') return 'Password recovery code';
  if (step === 'PASSWORD' || step === 'SET_PASSWORD') return 'Password';
  return 'Authenticator code';
}

export function AuthChallengeForm({
  intent = 'SIGN_IN',
  organizationSlug,
  returnTo,
}: AuthChallengeFormProps) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [invitationToken, setInvitationToken] = useState<string | undefined>();
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [response, setResponse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (intent === 'ACCEPT_INVITATION') {
      setInvitationToken(window.location.hash.replace(/^#token=/, '') || undefined);
    }
  }, [intent]);

  const destination = returnTo ?? searchParams.get('returnTo') ?? '/';

  async function start(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await fetch('/api/v1/auth/challenges', {
        body: JSON.stringify({
          email,
          intent,
          ...(invitationToken ? { invitation_token: decodeURIComponent(invitationToken) } : {}),
          ...(organizationSlug ? { organization_slug: organizationSlug } : {}),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body = (await result.json()) as AuthChallenge | ProblemResponse;
      if (!result.ok) throw new Error((body as ProblemResponse).message);
      setChallenge(body as AuthChallenge);
      setResponse('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign-in could not be started.');
    } finally {
      setSubmitting(false);
    }
  }

  async function respond(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await fetch(
        `/api/v1/auth/challenges/${encodeURIComponent(challenge.challenge_id)}/respond`,
        {
          body: JSON.stringify({ response, step: challenge.next_step }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      const body = (await result.json()) as AuthChallenge | AuthSession | ProblemResponse;
      if (!result.ok) throw new Error((body as ProblemResponse).message);
      if ('account_id' in body) {
        window.location.assign(
          intent === 'JOIN_ORGANIZATION' && organizationSlug
            ? `/o/${encodeURIComponent(organizationSlug)}/join`
            : destination,
        );
        return;
      }
      setChallenge(body as AuthChallenge);
      setResponse('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authCard">
      <span className="authIcon" aria-hidden="true">
        <KeyRound size={24} />
      </span>
      {!challenge ? (
        <form onSubmit={start}>
          <label className="formField">
            <span>Email address</span>
            <input
              autoComplete="email"
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <button
            className="buttonPrimary authSubmit"
            disabled={submitting || (intent === 'ACCEPT_INVITATION' && !invitationToken)}
            type="submit"
          >
            <LogIn aria-hidden="true" size={17} />
            {submitting
              ? 'Starting…'
              : intent === 'SIGN_IN'
                ? 'Continue'
                : intent === 'RECOVER_PASSWORD'
                  ? 'Recover account'
                  : 'Verify email'}
          </button>
        </form>
      ) : challenge.next_step === 'AUTHENTICATED' ? (
        <p>Authentication complete. Redirecting…</p>
      ) : (
        <form onSubmit={respond}>
          {challenge.next_step === 'ENROLL_TOTP' && challenge.setup_secret ? (
            <div className="notice">
              Add this key to your authenticator app:
              <strong className="totpSecret">{challenge.setup_secret}</strong>
            </div>
          ) : null}
          <label className="formField">
            <span>{challengeLabel(challenge.next_step)}</span>
            <input
              autoComplete={
                challenge.next_step === 'PASSWORD' || challenge.next_step === 'SET_PASSWORD'
                  ? 'current-password'
                  : 'one-time-code'
              }
              autoFocus
              minLength={challenge.next_step === 'SET_PASSWORD' ? 12 : undefined}
              onChange={(event) => setResponse(event.target.value)}
              required
              type={
                challenge.next_step === 'PASSWORD' || challenge.next_step === 'SET_PASSWORD'
                  ? 'password'
                  : 'text'
              }
              value={response}
            />
          </label>
          {process.env.NODE_ENV !== 'production' ? (
            <small className="authLocalHint">
              Local codes: email 123456, password CampLocal!123, authenticator 654321.
            </small>
          ) : null}
          <button className="buttonPrimary authSubmit" disabled={submitting} type="submit">
            {submitting ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      )}
      {message ? (
        <div className="notice noticeError" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          {message}
        </div>
      ) : null}
    </div>
  );
}
