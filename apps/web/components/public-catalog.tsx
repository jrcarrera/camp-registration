'use client';

import type { PublicCatalog } from '@camp-registration/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
function date(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(
    new Date(`${value}T12:00:00Z`),
  );
}
function timestamp(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function PublicCatalogView({
  catalog,
  preview = false,
}: {
  catalog: PublicCatalog;
  preview?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState('');
  const [season, setSeason] = useState('');
  const [delivery, setDelivery] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [age, setAge] = useState('');
  const [grade, setGrade] = useState('');
  const programs = new Map(catalog.programs.map((program) => [program.id, program]));
  const sessions = useMemo(
    () =>
      catalog.sessions.filter((session) => {
        const program = programs.get(session.program_id);
        const text = `${session.name} ${program?.name ?? ''}`.toLowerCase();
        return (
          (!query || text.includes(query.toLowerCase())) &&
          (!season || String(session.season_year) === season) &&
          (!availability || session.availability === availability) &&
          (!delivery || program?.delivery_mode === delivery) &&
          (!maxPrice || session.price_cents <= Number(maxPrice) * 100) &&
          (!dateFrom || session.ends_on >= dateFrom) &&
          (!age || (session.minimum_age <= Number(age) && session.maximum_age >= Number(age))) &&
          (!grade ||
            (session.minimum_grade <= Number(grade) && session.maximum_grade >= Number(grade)))
        );
      }),
    [
      age,
      availability,
      catalog.sessions,
      dateFrom,
      delivery,
      grade,
      maxPrice,
      programs,
      query,
      season,
    ],
  );
  const clear = () => {
    setQuery('');
    setAvailability('');
    setSeason('');
    setDelivery('');
    setMaxPrice('');
    setDateFrom('');
    setAge('');
    setGrade('');
  };
  return (
    <section
      className="publicCatalog"
      style={{ '--catalog-brand': catalog.organization.brand_primary_color } as React.CSSProperties}
    >
      {preview ? (
        <p className="contextLabel">Authenticated preview — not publicly published</p>
      ) : null}
      <header className="publicCatalogHeader">
        {catalog.organization.brand_logo_url ? (
          <img
            alt={`${catalog.organization.name} logo`}
            className="publicCatalogLogo"
            referrerPolicy="no-referrer"
            src={catalog.organization.brand_logo_url}
          />
        ) : null}
        <div>
          <h1>{catalog.organization.name}</h1>
          {catalog.organization.tagline ? (
            <p className="publicTagline">{catalog.organization.tagline}</p>
          ) : null}
          {catalog.organization.description ? <p>{catalog.organization.description}</p> : null}
          <p className="publicLinks">
            {catalog.organization.public_website_url ? (
              <a href={catalog.organization.public_website_url} rel="noreferrer" target="_blank">
                Visit website
              </a>
            ) : null}
            {catalog.organization.public_contact_email ? (
              <a href={`mailto:${catalog.organization.public_contact_email}`}>Contact camp</a>
            ) : null}
          </p>
        </div>
      </header>
      <div className="publicActions">
        <Link className="buttonPrimary" href="/sign-in?returnTo=%2Fportal%2Fregister">
          Sign in to register
        </Link>
        {catalog.organization.self_service_signup_enabled ? (
          <Link
            className="buttonSecondary"
            href={`/o/${encodeURIComponent(catalog.organization.slug)}/join`}
          >
            Request a family account
          </Link>
        ) : null}
      </div>
      {catalog.organization.self_service_signup_enabled ? (
        <p className="publicNotice">New family requests need staff approval before registration.</p>
      ) : null}
      <form className="publicFilters" onSubmit={(event) => event.preventDefault()}>
        <label className="formField">
          <span>Search sessions</span>
          <input onChange={(event) => setQuery(event.target.value)} value={query} />
        </label>
        <label className="formField">
          <span>Season</span>
          <select onChange={(event) => setSeason(event.target.value)} value={season}>
            <option value="">All seasons</option>
            {catalog.seasons.map((item) => (
              <option key={item.year} value={String(item.year)}>
                {item.name} ({item.year})
              </option>
            ))}
          </select>
        </label>
        <label className="formField">
          <span>Availability</span>
          <select onChange={(event) => setAvailability(event.target.value)} value={availability}>
            <option value="">All availability</option>
            <option>OPEN</option>
            <option>LIMITED</option>
            <option>WAITLIST</option>
            <option>FULL</option>
          </select>
        </label>
        <label className="formField">
          <span>Format</span>
          <select onChange={(event) => setDelivery(event.target.value)} value={delivery}>
            <option value="">All formats</option>
            <option value="DAY">Day camp</option>
            <option value="OVERNIGHT">Overnight</option>
          </select>
        </label>
        <label className="formField">
          <span>Maximum price</span>
          <input
            inputMode="numeric"
            min="0"
            onChange={(event) => setMaxPrice(event.target.value)}
            type="number"
            value={maxPrice}
          />
        </label>
        <label className="formField">
          <span>Available on or after</span>
          <input
            onChange={(event) => setDateFrom(event.target.value)}
            type="date"
            value={dateFrom}
          />
        </label>
        <label className="formField">
          <span>Camper age</span>
          <input
            inputMode="numeric"
            max="120"
            min="0"
            onChange={(event) => setAge(event.target.value)}
            type="number"
            value={age}
          />
        </label>
        <label className="formField">
          <span>Camper grade</span>
          <input
            inputMode="numeric"
            max="12"
            min="0"
            onChange={(event) => setGrade(event.target.value)}
            type="number"
            value={grade}
          />
        </label>
        <button className="buttonSecondary" onClick={clear} type="button">
          Clear filters
        </button>
      </form>
      <p aria-live="polite" className="publicResults">
        {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} shown
      </p>
      {catalog.sessions.length === 0 ? (
        <p className="publicEmpty">No published sessions are available yet.</p>
      ) : sessions.length === 0 ? (
        <p className="publicEmpty">
          No sessions match these filters.{' '}
          <button onClick={clear} type="button">
            Clear filters
          </button>
        </p>
      ) : (
        <div className="publicSessionGrid">
          {sessions.map((session) => {
            const program = programs.get(session.program_id);
            return (
              <article className="publicSessionCard" key={session.id}>
                <p className="contextLabel">
                  {session.season_year} · {program?.name}
                </p>
                <h2>{session.name}</h2>
                <p>
                  {date(session.starts_on)} – {date(session.ends_on)}
                </p>
                <p>
                  {money(session.price_cents)}
                  {session.deposit_cents ? ` · ${money(session.deposit_cents)} deposit` : ''}
                </p>
                <p>
                  Ages {session.minimum_age}–{session.maximum_age} · Grades {session.minimum_grade}–
                  {session.maximum_grade}
                </p>
                <p>
                  <strong>
                    {session.registration_state === 'NOT_YET_OPEN'
                      ? `Registration opens ${timestamp(session.registration_opens_at)}`
                      : session.registration_state === 'CLOSED'
                        ? 'Registration closed'
                        : 'Registration open'}
                  </strong>
                </p>
                <p>
                  <strong>Availability: {session.availability}</strong>
                  {session.availability === 'WAITLIST'
                    ? ' — a waitlist space is not a guaranteed seat.'
                    : session.availability === 'FULL'
                      ? ' — this session is full.'
                      : ''}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
