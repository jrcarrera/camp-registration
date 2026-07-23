'use client';

import type { OnboardingRequest, ProblemResponse } from '@camp-registration/contracts';
import { AlertCircle, Send } from 'lucide-react';
import { type FormEvent, useState } from 'react';

export function OnboardingRequestForm({ organizationSlug }: { organizationSlug: string }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/public/organizations/${encodeURIComponent(organizationSlug)}/onboarding`,
        {
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            phone: phone.trim() || null,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      const result = (await response.json()) as OnboardingRequest | ProblemResponse;
      if (!response.ok) throw new Error((result as ProblemResponse).message);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your request could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="authCard onboardingForm" onSubmit={submit}>
      <div className="fieldGrid">
        <label className="formField">
          <span>First name</span>
          <input
            onChange={(event) => setFirstName(event.target.value)}
            required
            value={firstName}
          />
        </label>
        <label className="formField">
          <span>Last name</span>
          <input onChange={(event) => setLastName(event.target.value)} required value={lastName} />
        </label>
        <label className="formField">
          <span>Phone (optional)</span>
          <input
            autoComplete="tel"
            onChange={(event) => setPhone(event.target.value)}
            value={phone}
          />
        </label>
      </div>
      <button className="buttonPrimary authSubmit" disabled={submitting} type="submit">
        <Send aria-hidden="true" size={17} />
        {submitting ? 'Submitting…' : 'Request family account'}
      </button>
      {message ? (
        <div className="notice noticeError" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          {message}
        </div>
      ) : null}
    </form>
  );
}
