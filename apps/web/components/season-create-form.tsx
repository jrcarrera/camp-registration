'use client';

import type { ProblemResponse, SeasonCreate, SeasonFixture } from '@camp-registration/contracts';
import { AlertCircle, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function SeasonCreateForm({ defaultYear }: { defaultYear: number }) {
  const router = useRouter();
  const [season, setSeason] = useState<SeasonCreate>({
    name: `Summer ${defaultYear}`,
    year: defaultYear,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <Key extends keyof SeasonCreate>(key: Key, value: SeasonCreate[Key]) => {
    setSeason((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)),
    );
    setMessage(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/seasons', {
        body: JSON.stringify({
          name: season.name.trim(),
          year: season.year,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const result = (await response.json()) as SeasonFixture | ProblemResponse;
      if (!response.ok) {
        const problem = result as ProblemResponse;
        setFieldErrors(problem.field_errors ?? {});
        setMessage(problem.message);
        return;
      }
      router.replace('/seasons');
      router.refresh();
    } catch {
      setMessage('The season could not be created. Try again.');
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
      <section className="editorSection" aria-labelledby="season-details">
        <div className="editorSectionHeading">
          <h2 id="season-details">Season details</h2>
          <p>A season groups the camp weeks families can register for in a given year.</p>
        </div>
        <div className="fieldGrid">
          <label className={`formField${fieldErrors.name ? ' fieldError' : ''}`}>
            <span>Season name</span>
            <input
              value={season.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={160}
              required
            />
            {fieldErrors.name && <small>{fieldErrors.name}</small>}
          </label>
          <label className={`formField${fieldErrors.year ? ' fieldError' : ''}`}>
            <span>Year</span>
            <input
              type="number"
              min="2000"
              max="2200"
              value={season.year}
              onChange={(event) => set('year', Number(event.target.value))}
              required
            />
            {fieldErrors.year && <small>{fieldErrors.year}</small>}
          </label>
        </div>
      </section>
      <div className="editorActions">
        <span className="dirtyIndicator">New season</span>
        <div>
          <button className="buttonSecondary" type="button" onClick={() => router.push('/seasons')}>
            <X size={17} aria-hidden="true" />
            Cancel
          </button>
          <button className="buttonPrimary" type="submit" disabled={saving}>
            <Save size={17} aria-hidden="true" />
            {saving ? 'Creating...' : 'Create season'}
          </button>
        </div>
      </div>
    </form>
  );
}
