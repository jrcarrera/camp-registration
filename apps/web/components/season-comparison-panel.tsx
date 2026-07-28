'use client';

import type {
  ProblemResponse,
  SeasonComparison,
  SeasonComparisonOption,
} from '@camp-registration/contracts';
import { BarChart3, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';

function dollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(cents / 100);
}

function percent(basisPoints: number | null): string {
  if (basisPoints === null) return 'No baseline';
  const value = basisPoints / 100;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function rate(basisPoints: number | null): string {
  return basisPoints === null ? '—' : `${(basisPoints / 100).toFixed(1)}%`;
}

export function SeasonComparisonPanel({
  initialComparison,
  seasons,
}: {
  initialComparison: SeasonComparison | null;
  seasons: SeasonComparisonOption[];
}) {
  const [primarySeasonId, setPrimarySeasonId] = useState(
    initialComparison?.primary.season_id ?? seasons[0]?.id ?? '',
  );
  const [comparisonSeasonId, setComparisonSeasonId] = useState(
    initialComparison?.comparison.season_id ?? seasons[1]?.id ?? '',
  );
  const [comparison, setComparison] = useState(initialComparison);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function compare(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({
        comparison_season_id: comparisonSeasonId,
        primary_season_id: primarySeasonId,
      });
      const response = await fetch(`/api/v1/reports/season-comparison?${query}`);
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
        throw new Error(problem?.message ?? 'Season comparison could not be loaded.');
      }
      setComparison((await response.json()) as SeasonComparison);
      setMessage('Season comparison updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Season comparison could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  const metrics = comparison
    ? [
        {
          baseline: comparison.comparison.confirmed_registrations.toLocaleString(),
          change: percent(comparison.changes.confirmed_registrations.basis_points),
          label: 'Confirmed enrollment',
          primary: comparison.primary.confirmed_registrations.toLocaleString(),
        },
        {
          baseline: rate(comparison.comparison.capacity_fill_basis_points),
          change:
            comparison.primary.capacity_fill_basis_points === null ||
            comparison.comparison.capacity_fill_basis_points === null
              ? 'No baseline'
              : `${(
                  (comparison.primary.capacity_fill_basis_points -
                    comparison.comparison.capacity_fill_basis_points) /
                  100
                ).toFixed(1)} pts`,
          label: 'Capacity filled',
          primary: rate(comparison.primary.capacity_fill_basis_points),
        },
        {
          baseline: dollars(comparison.comparison.tuition_booked_cents),
          change: percent(comparison.changes.tuition_booked_cents.basis_points),
          label: 'Tuition booked',
          primary: dollars(comparison.primary.tuition_booked_cents),
        },
        {
          baseline: dollars(comparison.comparison.net_collected_cents),
          change: percent(comparison.changes.net_collected_cents.basis_points),
          label: 'Net cash collected',
          primary: dollars(comparison.primary.net_collected_cents),
        },
      ]
    : [];

  return (
    <section
      className="contentSection seasonComparison"
      aria-labelledby="season-comparison-heading"
    >
      <div className="sectionHeading">
        <div>
          <p className="contextLabel">Year-over-year performance</p>
          <h2 id="season-comparison-heading">Compare seasons</h2>
          <p className="sectionDescription">
            Evaluate enrollment, capacity, tuition, collections, and returning campers from the same
            tenant-owned history.
          </p>
        </div>
        <BarChart3 size={24} aria-hidden="true" />
      </div>

      {seasons.length < 2 ? (
        <p className="emptyStateText">Create a second season before comparing performance.</p>
      ) : (
        <>
          <form className="seasonComparisonControls" onSubmit={compare}>
            <label className="formField">
              <span>Primary season</span>
              <select
                value={primarySeasonId}
                onChange={(event) => setPrimarySeasonId(event.target.value)}
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="formField">
              <span>Compare with</span>
              <select
                value={comparisonSeasonId}
                onChange={(event) => setComparisonSeasonId(event.target.value)}
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="buttonSecondary"
              disabled={
                busy ||
                !primarySeasonId ||
                !comparisonSeasonId ||
                primarySeasonId === comparisonSeasonId
              }
              type="submit"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {busy ? 'Comparing…' : 'Update comparison'}
            </button>
          </form>

          {message ? (
            <p className="reportSelectionSummary" role="status">
              {message}
            </p>
          ) : null}

          {comparison ? (
            <>
              <div className="seasonComparisonContext">
                <strong>{comparison.primary.season_name}</strong>
                <span>compared with {comparison.comparison.season_name}</span>
              </div>
              <div className="seasonMetricGrid">
                {metrics.map((metric) => (
                  <article className="seasonMetricCard" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.primary}</strong>
                    <small>
                      {metric.change} vs {metric.baseline}
                    </small>
                  </article>
                ))}
              </div>
              <dl className="seasonComparisonDetails">
                <div>
                  <dt>Returning campers</dt>
                  <dd>
                    {comparison.returning_campers.toLocaleString()} ·{' '}
                    {rate(comparison.returning_rate_basis_points)} of primary campers
                  </dd>
                </div>
                <div>
                  <dt>Waitlisted</dt>
                  <dd>
                    {comparison.primary.waitlisted_registrations.toLocaleString()} vs{' '}
                    {comparison.comparison.waitlisted_registrations.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Cancelled</dt>
                  <dd>
                    {comparison.primary.cancelled_registrations.toLocaleString()} vs{' '}
                    {comparison.comparison.cancelled_registrations.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Outstanding balance</dt>
                  <dd>
                    {dollars(comparison.primary.outstanding_balance_cents)} vs{' '}
                    {dollars(comparison.comparison.outstanding_balance_cents)}
                  </dd>
                </div>
              </dl>
              <p className="seasonComparisonDisclosure">
                Cash collected includes settled online and recorded offline payments, excluding
                discounts, scholarships, and account credits. Net cash subtracts succeeded refunds.
              </p>
            </>
          ) : (
            <p className="emptyStateText">Choose two seasons to load a comparison.</p>
          )}
        </>
      )}
    </section>
  );
}
