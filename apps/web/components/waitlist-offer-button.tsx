'use client';

import type {
  FamilyRegistrationResult,
  ProblemResponse,
  WaitlistOfferDurationHours,
} from '@camp-registration/contracts';
import { AlertCircle, Ban, CheckCircle2, MailPlus, RefreshCw, SkipForward } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

interface OfferState {
  message: string | null;
  saving: boolean;
  tone: 'error' | 'success';
}

type ReasonedOfferAction = 'cancel' | 'skip';

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
  const [pendingAction, setPendingAction] = useState<ReasonedOfferAction | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const reasonErrorId = useId();

  useEffect(() => {
    if (pendingAction && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
      reasonRef.current?.focus();
    }
  }, [pendingAction]);

  const closeDialog = () => {
    if (!state.saving) dialogRef.current?.close();
  };

  const resetDialog = () => {
    const returnFocus = returnFocusRef.current;
    setPendingAction(null);
    setReason('');
    setReasonError(null);
    returnFocusRef.current = null;
    requestAnimationFrame(() => returnFocus?.focus());
  };

  const openDialog = (action: ReasonedOfferAction, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger;
    setReason('');
    setReasonError(null);
    setPendingAction(action);
  };

  const resend = async () => {
    setState({ ...cleanState, saving: true });
    const result = await manageOffer(sessionId, offerId, 'resend', null);
    if ('code' in result) {
      setState({ message: result.message, saving: false, tone: 'error' });
      return;
    }
    setState({
      message: 'Offer notification queued again.',
      saving: false,
      tone: 'success',
    });
    router.refresh();
  };

  const confirmReasonedAction = async () => {
    if (!pendingAction) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setReasonError('Enter at least 3 characters explaining this action.');
      reasonRef.current?.focus();
      return;
    }

    setReasonError(null);
    setState({ ...cleanState, saving: true });
    const result = await manageOffer(sessionId, offerId, pendingAction, trimmedReason);
    if ('code' in result) {
      setReasonError(result.message);
      setState(cleanState);
      reasonRef.current?.focus();
      return;
    }

    setState({
      message:
        pendingAction === 'skip'
          ? 'Offer cancelled and camper moved to the end of the queue.'
          : 'Offer cancelled; camper kept in the same queue position.',
      saving: false,
      tone: 'success',
    });
    dialogRef.current?.close();
    router.refresh();
  };

  const dialogCopy =
    pendingAction === 'skip'
      ? {
          confirmLabel: 'Move to end',
          description:
            'The active offer will end and the camper will move to the end of the waitlist.',
          heading: 'Move camper to the end?',
          reasonLabel: 'Reason for skipping this offer',
        }
      : {
          confirmLabel: 'Cancel offer',
          description:
            'The active offer will end. The camper keeps the same queue position and may receive another offer during the next automation cycle.',
          heading: 'Cancel waitlist offer?',
          reasonLabel: 'Reason for cancelling this offer',
        };

  return (
    <div className="waitlistOfferControls">
      <div className="inlineActions">
        <button
          className="buttonSecondary"
          type="button"
          disabled={state.saving}
          onClick={() => void resend()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Resend
        </button>
        <button
          className="buttonSecondary dangerInlineButton"
          type="button"
          disabled={state.saving}
          onClick={(event) => openDialog('cancel', event.currentTarget)}
        >
          <Ban size={15} aria-hidden="true" />
          Cancel
        </button>
        <button
          className="buttonSecondary"
          type="button"
          disabled={state.saving}
          onClick={(event) => openDialog('skip', event.currentTarget)}
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
      <dialog
        aria-describedby={dialogDescriptionId}
        aria-labelledby={dialogTitleId}
        className="waitlistConfirmationDialog"
        onCancel={(event) => {
          if (state.saving) event.preventDefault();
        }}
        onClose={resetDialog}
        ref={dialogRef}
      >
        <form
          className="waitlistConfirmationForm"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmReasonedAction();
          }}
        >
          <div className="waitlistConfirmationHeader">
            <span className="waitlistConfirmationIcon" aria-hidden="true">
              {pendingAction === 'skip' ? <SkipForward size={19} /> : <Ban size={19} />}
            </span>
            <div>
              <h2 id={dialogTitleId}>{dialogCopy.heading}</h2>
              <p id={dialogDescriptionId}>{dialogCopy.description}</p>
            </div>
          </div>
          <label className="formField waitlistConfirmationReason">
            <span>{dialogCopy.reasonLabel}</span>
            <textarea
              aria-describedby={reasonError ? reasonErrorId : undefined}
              aria-invalid={Boolean(reasonError)}
              disabled={state.saving}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError(null);
              }}
              placeholder="Add an operator note for the audit trail"
              ref={reasonRef}
              value={reason}
            />
          </label>
          {reasonError ? (
            <p className="waitlistConfirmationError" id={reasonErrorId} role="alert">
              <AlertCircle size={17} aria-hidden="true" />
              {reasonError}
            </p>
          ) : null}
          <div className="waitlistConfirmationActions">
            <button
              className="buttonSecondary"
              disabled={state.saving}
              onClick={closeDialog}
              type="button"
            >
              Keep offer
            </button>
            <button
              className={
                pendingAction === 'cancel' ? 'buttonPrimary waitlistDangerButton' : 'buttonPrimary'
              }
              disabled={state.saving}
              type="submit"
            >
              {state.saving ? 'Saving…' : dialogCopy.confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
