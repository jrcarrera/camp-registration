'use client';

import type {
  ProblemResponse,
  SeasonFixture,
  SeasonRolloverCreate,
  SeasonRolloverResult,
} from '@camp-registration/contracts';
import { AlertCircle, Copy, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function SeasonRolloverForm({
  defaultYear,
  sessionCount,
  sourceSeason,
}: {
  defaultYear: number;
  sessionCount: number;
  sourceSeason: SeasonFixture;
}) {
  const router = useRouter();
  const [rollover, setRollover] = useState<SeasonRolloverCreate>({
    name: `Summer ${defaultYear}`,
    year: defaultYear,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <Key extends keyof SeasonRolloverCreate>(
    key: Key,
    value: SeasonRolloverCreate[Key],
  ) => {
    setRollover((current) => ({ ...current, [key]: value }));
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
      const response = await fetch(`/api/v1/seasons/${sourceSeason.id}/rollover`, {
        body: JSON.stringify({ name: rollover.name.trim(), year: rollover.year }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const result = (await response.json()) as SeasonRolloverResult | ProblemResponse;
      if (!response.ok) {
        const problem = result as ProblemResponse;
        setFieldErrors(problem.field_errors ?? {});
        setMessage(problem.message);
        return;
      }
      const created = result as SeasonRolloverResult;
      router.replace(`/sessions?seasonId=${created.target_season.id}&rollover=success`);
      router.refresh();
    } catch {
      setMessage('The season could not be rolled over. Try again.');
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
      <section className="editorSection" aria-labelledby="rollover-details">
        <div className="editorSectionHeading">
          <h2 id="rollover-details">New season details</h2>
          <p>
            Copy {sessionCount} active {sessionCount === 1 ? 'session' : 'sessions'} from{' '}
            {sourceSeason.name}. Dates and registration windows move by the year difference.
          </p>
        </div>
        <div className="notice" role="note">
          <Copy size={18} aria-hidden="true" />
          Copied sessions start as drafts. Review dates, prices, capacity, and policies before
          publishing them to families.
        </div>
        <div className="fieldGrid">
          <label className={`formField${fieldErrors.name ? ' fieldError' : ''}`}>
            <span>Season name</span>
            <input
              value={rollover.name}
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
              value={rollover.year}
              onChange={(event) => set('year', Number(event.target.value))}
              required
            />
            {fieldErrors.year && <small>{fieldErrors.year}</small>}
          </label>
        </div>
      </section>
      <div className="editorActions">
        <span className="dirtyIndicator">Source: {sourceSeason.name}</span>
        <div>
          <button className="buttonSecondary" type="button" onClick={() => router.push('/seasons')}>
            <X size={17} aria-hidden="true" />
            Cancel
          </button>
          <button className="buttonPrimary" type="submit" disabled={saving}>
            <Copy size={17} aria-hidden="true" />
            {saving ? 'Copying...' : 'Create draft season'}
          </button>
        </div>
      </div>
    </form>
  );
}
