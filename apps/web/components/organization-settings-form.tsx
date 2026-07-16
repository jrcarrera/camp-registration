'use client';

import type {
  OrganizationFixture,
  ProblemResponse,
  WaitlistOfferDurationHours,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { useState } from 'react';

export function OrganizationSettingsForm({ organization }: { organization: OrganizationFixture }) {
  const [durationHours, setDurationHours] = useState<WaitlistOfferDurationHours>(
    organization.waitlist_offer_duration_hours,
  );
  const [savedDurationHours, setSavedDurationHours] = useState<WaitlistOfferDurationHours>(
    organization.waitlist_offer_duration_hours,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/v1/organization/settings', {
        body: JSON.stringify({ waitlist_offer_duration_hours: durationHours }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
        throw new Error(problem?.message ?? 'Organization settings could not be saved.');
      }
      const updated = (await response.json()) as OrganizationFixture;
      setDurationHours(updated.waitlist_offer_duration_hours);
      setSavedDurationHours(updated.waitlist_offer_duration_hours);
      setMessage('Waitlist offer policy saved.');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Organization settings could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editorForm organizationSettingsForm">
      <section className="editorSection" aria-labelledby="waitlist-policy-heading">
        <div className="editorSectionHeading">
          <h2 id="waitlist-policy-heading">Waitlist offer policy</h2>
          <p>
            This claim window is used by automated offers and by staff when they select the
            organization default. Staff can still choose a different window for one offer.
          </p>
        </div>
        <div className="organizationSettingsFields">
          <label className="formField">
            <span>Default claim window</span>
            <select
              disabled={saving}
              onChange={(event) =>
                setDurationHours(Number(event.target.value) as WaitlistOfferDurationHours)
              }
              value={durationHours}
            >
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={72}>72 hours</option>
              <option value={168}>7 days</option>
            </select>
          </label>
          <p className="settingsPolicySummary">
            New automated offers for {organization.name} will expire{' '}
            <strong>
              {durationHours === 168 ? 'after 7 days' : `after ${durationHours} hours`}
            </strong>
            .
          </p>
          {message ? (
            <div className="notice noticeSuccess" role="status">
              <CheckCircle2 aria-hidden="true" size={18} />
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="notice noticeError" role="alert">
              <AlertCircle aria-hidden="true" size={18} />
              {error}
            </div>
          ) : null}
          <button
            className="buttonPrimary settingsSaveButton"
            disabled={saving || durationHours === savedDurationHours}
            onClick={() => void save()}
            type="button"
          >
            <Save aria-hidden="true" size={16} />
            {saving ? 'Saving…' : 'Save policy'}
          </button>
        </div>
      </section>
    </div>
  );
}
