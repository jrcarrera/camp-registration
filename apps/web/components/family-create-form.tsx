'use client';

import type { FamilyCreate, FamilyDetail, ProblemResponse } from '@camp-registration/contracts';
import { AlertCircle, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function FamilyCreateForm() {
  const router = useRouter();
  const [family, setFamily] = useState<FamilyCreate>({ family_name: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setFamilyName = (family_name: string) => {
    setFamily({ family_name });
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => field !== 'family_name')),
    );
    setMessage(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/families', {
        body: JSON.stringify({ family_name: family.family_name.trim() }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const result = (await response.json()) as FamilyDetail | ProblemResponse;
      if (!response.ok) {
        const problem = result as ProblemResponse;
        setFieldErrors(problem.field_errors ?? {});
        setMessage(problem.message);
        return;
      }
      router.replace(`/families/${(result as FamilyDetail).id}`);
      router.refresh();
    } catch {
      setMessage('The family could not be created. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="editorForm" onSubmit={submit}>
      {message && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {message}
        </div>
      )}
      <section className="editorSection" aria-labelledby="family-details">
        <div className="editorSectionHeading">
          <h2 id="family-details">Family details</h2>
          <p>The family is the household account for adults, campers, contacts, and payments.</p>
        </div>
        <div className="fieldGrid">
          <label className={`formField${fieldErrors.family_name ? ' fieldError' : ''}`}>
            <span>Family name</span>
            <input
              value={family.family_name}
              onChange={(event) => setFamilyName(event.target.value)}
              maxLength={160}
              placeholder="Smith Family"
              required
            />
            {fieldErrors.family_name && <small>{fieldErrors.family_name}</small>}
          </label>
        </div>
      </section>
      <div className="editorActions">
        <span className="dirtyIndicator">New family</span>
        <div>
          <button
            className="buttonSecondary"
            type="button"
            onClick={() => router.push('/families')}
          >
            <X size={17} aria-hidden="true" />
            Cancel
          </button>
          <button className="buttonPrimary" type="submit" disabled={saving}>
            <Save size={17} aria-hidden="true" />
            {saving ? 'Creating...' : 'Create family'}
          </button>
        </div>
      </div>
    </form>
  );
}
