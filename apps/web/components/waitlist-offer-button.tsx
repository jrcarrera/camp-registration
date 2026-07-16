'use client';

import type {
  FamilyRegistrationResult,
  ProblemResponse,
  WaitlistOfferDurationHours,
} from '@camp-registration/contracts';
import { AlertCircle, Ban, CheckCircle2, MailPlus, RefreshCw, SkipForward } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface OfferState {
  message: string | null;
  saving: boolean;
  tone: 'error' | 'success';
}

const cleanState: OfferState = {
  message: null,
  saving: false,
  tone: 'success',
};

async function createOffer(
  sessionId: string,
  expiresInHours: WaitlistOfferDurationHours | null,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(`/api/v1/sessions/${sessionId}/waitlist/offers`, {
      body: JSON.stringify(expiresInHours === null ? {} : { expires_in_hours: expiresInHours }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The waitlist offer could not be created.' };
  }
}

async function manageOffer(
  sessionId: string,
  offerId: string,
  action: 'cancel' | 'resend' | 'skip',
  reason: string | null,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(
      `/api/v1/sessions/${sessionId}/waitlist/offers/${offerId}/${action}`,
      {
        body: JSON.stringify(reason ? { reason } : {}),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The waitlist offer could not be updated.' };
  }
}

export function WaitlistOfferButton({
  defaultExpiresInHours,
  disabled,
  sessionId,
}: {
  defaultExpiresInHours: WaitlistOfferDurationHours;
  disabled: boolean;
  sessionId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<OfferState>(cleanState);
  const [expiresInHours, setExpiresInHours] = useState<WaitlistOfferDurationHours | null>(null);

  const submit = async () => {
    setState({ ...cleanState, saving: true });
    const result = await createOffer(sessionId, expiresInHours);
    if ('code' in result) {
      setState({ message: result.message, saving: false, tone: 'error' });
      return;
    }
    const offer = result.registration.waitlist_offer;
    setState({
      message: offer
        ? `Offer reserved until ${new Date(offer.expires_at).toLocaleString('en-US')}.`
        : 'Waitlist offer created.',
      saving: false,
      tone: 'success',
    });
    router.refresh();
  };

  return (
    <div className="waitlistAction">
      <div className="waitlistOfferCreator">
        <label>
          <span>Claim window</span>
          <select
            aria-label="Waitlist offer claim window"
            disabled={state.saving}
            value={expiresInHours ?? 'default'}
            onChange={(event) =>
              setExpiresInHours(
                event.target.value === 'default'
                  ? null
                  : (Number(event.target.value) as WaitlistOfferDurationHours),
              )
            }
          >
            <option value="default">Organization default ({defaultExpiresInHours} hours)</option>
            <option value={24}>24 hours</option>
            <option value={48}>48 hours</option>
            <option value={72}>72 hours</option>
            <option value={168}>7 days</option>
          </select>
        </label>
        <button
          className="buttonSecondary"
          type="button"
          disabled={disabled || state.saving}
          onClick={() => void submit()}
        >
          <MailPlus size={17} aria-hidden="true" />
          {state.saving ? 'Creating offer...' : 'Offer next'}
        </button>
      </div>
      {state.message && (
        <div
          className={`notice notice${state.tone === 'error' ? 'Error' : 'Success'}`}
          role={state.tone === 'error' ? 'alert' : 'status'}
        >
          {state.tone === 'error' ? (
            <AlertCircle size={18} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={18} aria-hidden="true" />
          )}
          {state.message}
        </div>
      )}
    </div>
  );
}

export function WaitlistOfferControls({
  offerId,
  sessionId,
}: {
  offerId: string;
  sessionId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<OfferState>(cleanState);

  const submit = async (action: 'cancel' | 'resend' | 'skip') => {
    let reason: string | null = null;
    if (action !== 'resend') {
      const answer = window.prompt(
        action === 'skip'
          ? 'Why should this camper move to the end of the waitlist?'
          : 'Why is this offer being cancelled?',
      );
      if (answer === null) return;
      reason = answer.trim();
      if (reason.length < 3) {
        setState({
          message: 'Enter a short reason for this action.',
          saving: false,
          tone: 'error',
        });
        return;
      }
    }

    setState({ ...cleanState, saving: true });
    const result = await manageOffer(sessionId, offerId, action, reason);
    if ('code' in result) {
      setState({ message: result.message, saving: false, tone: 'error' });
      return;
    }
    setState({
      message:
        action === 'resend'
          ? 'Offer notification queued again.'
          : action === 'skip'
            ? 'Offer cancelled and camper moved to the end of the queue.'
            : 'Offer cancelled; camper kept in the same queue position.',
      saving: false,
      tone: 'success',
    });
    router.refresh();
  };

  return (
    <div className="waitlistOfferControls">
      <div className="inlineActions">
        <button
          className="buttonSecondary"
          type="button"
          disabled={state.saving}
          onClick={() => void submit('resend')}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Resend
        </button>
        <button
          className="buttonSecondary dangerInlineButton"
          type="button"
          disabled={state.saving}
          onClick={() => void submit('cancel')}
        >
          <Ban size={15} aria-hidden="true" />
          Cancel
        </button>
        <button
          className="buttonSecondary"
          type="button"
          disabled={state.saving}
          onClick={() => void submit('skip')}
        >
          <SkipForward size={15} aria-hidden="true" />
          Skip
        </button>
      </div>
      {state.message && (
        <small className={state.tone === 'error' ? 'inlineError' : 'inlineSuccess'} role="status">
          {state.message}
        </small>
      )}
    </div>
  );
}
