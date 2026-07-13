'use client';

import type { FamilyRegistrationResult, ProblemResponse } from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, MailPlus } from 'lucide-react';
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

async function createOffer(sessionId: string): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(`/api/v1/sessions/${sessionId}/waitlist/offers`, {
      body: JSON.stringify({ expires_in_hours: 48 }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The waitlist offer could not be created.' };
  }
}

export function WaitlistOfferButton({
  disabled,
  sessionId,
}: {
  disabled: boolean;
  sessionId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<OfferState>(cleanState);

  const submit = async () => {
    setState({ ...cleanState, saving: true });
    const result = await createOffer(sessionId);
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
      <button
        className="buttonSecondary"
        type="button"
        disabled={disabled || state.saving}
        onClick={() => void submit()}
      >
        <MailPlus size={17} aria-hidden="true" />
        {state.saving ? 'Creating offer...' : 'Offer next · 48 hours'}
      </button>
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
