'use client';

import type { FamilyRegistrationResult, ProblemResponse } from '@camp-registration/contracts';
import { ArrowUpCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PromoteState {
  message: string | null;
  saving: boolean;
  tone: 'error' | 'success';
}

const cleanState: PromoteState = {
  message: null,
  saving: false,
  tone: 'success',
};

async function promote(sessionId: string): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(`/api/v1/sessions/${sessionId}/waitlist/promote`, {
      method: 'POST',
    });
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The waitlist could not be promoted.' };
  }
}

export function WaitlistPromoteButton({
  disabled,
  sessionId,
}: {
  disabled: boolean;
  sessionId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<PromoteState>(cleanState);

  const submit = async () => {
    setState({ ...cleanState, saving: true });
    const result = await promote(sessionId);
    if ('code' in result) {
      setState({ message: result.message, saving: false, tone: 'error' });
      return;
    }
    setState({
      message: `${result.registration.session_name} waitlist promoted.`,
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
        <ArrowUpCircle size={17} aria-hidden="true" />
        {state.saving ? 'Promoting...' : 'Promote waitlist'}
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
