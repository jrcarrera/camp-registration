'use client';

import type {
  FamilyRegistrationResult,
  ProblemResponse,
  RegisteredCamper,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, ReceiptText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

interface PaymentState {
  message: string | null;
  saving: boolean;
  tone: 'error' | 'success';
}

const cleanState: PaymentState = {
  message: null,
  saving: false,
  tone: 'success',
};

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function moneyToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function isProblem(value: FamilyRegistrationResult | ProblemResponse): value is ProblemResponse {
  return 'code' in value || 'field_errors' in value;
}

async function recordPayment(
  camper: RegisteredCamper,
  amount: string,
  method: string,
  note: string,
): Promise<FamilyRegistrationResult | ProblemResponse> {
  try {
    const response = await fetch(
      `/api/v1/families/${camper.family_id}/registrations/${camper.registration_id}/payments`,
      {
        body: JSON.stringify({
          amount_cents: moneyToCents(amount),
          method,
          note: note.trim() || null,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    return (await response.json()) as FamilyRegistrationResult | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'Payment could not be recorded.' };
  }
}

export function RegistrationPaymentForm({ camper }: { camper: RegisteredCamper }) {
  const router = useRouter();
  const defaultAmount = Math.min(
    camper.deposit_due_cents > 0 ? camper.deposit_due_cents : camper.balance_due_cents,
    camper.balance_due_cents,
  );
  const [amount, setAmount] = useState(() => centsToInput(defaultAmount));
  const [method, setMethod] = useState('OFFLINE_CHECK');
  const [note, setNote] = useState('');
  const [state, setState] = useState<PaymentState>(cleanState);
  const disabled = camper.status !== 'CONFIRMED' || camper.balance_due_cents === 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ ...cleanState, saving: true });
    const result = await recordPayment(camper, amount, method, note);
    if (isProblem(result)) {
      setState({ message: result.message, saving: false, tone: 'error' });
      return;
    }
    setState({ message: 'Payment recorded.', saving: false, tone: 'success' });
    setNote('');
    router.refresh();
  };

  return (
    <form
      className="paymentInlineForm"
      data-testid={`payment-form-${camper.registration_id}`}
      onSubmit={submit}
    >
      <div>
        <label>
          Amount
          <input
            aria-label="Payment amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={disabled || state.saving}
          />
        </label>
        <label>
          Method
          <select
            aria-label="Payment method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            disabled={disabled || state.saving}
          >
            <option value="OFFLINE_CHECK">Check</option>
            <option value="OFFLINE_CASH">Cash</option>
            <option value="OFFLINE_CARD">Offline card</option>
            <option value="SCHOLARSHIP">Scholarship</option>
            <option value="DISCOUNT">Discount</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Note
          <input
            aria-label="Payment note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            disabled={disabled || state.saving}
          />
        </label>
      </div>
      <button className="buttonSecondary" type="submit" disabled={disabled || state.saving}>
        <ReceiptText size={16} aria-hidden="true" />
        {state.saving ? 'Recording...' : 'Record payment'}
      </button>
      {state.message && (
        <span className={`paymentInlineMessage paymentInline${state.tone}`} role="status">
          {state.tone === 'error' ? (
            <AlertCircle size={14} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={14} aria-hidden="true" />
          )}
          {state.message}
        </span>
      )}
    </form>
  );
}
