'use client';

import type { ProblemResponse, WaitlistQueueOrderResult } from '@camp-registration/contracts';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  RotateCcw,
  Save,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export interface WaitlistQueueCamper {
  familyName: string;
  hasActiveOffer: boolean;
  name: string;
  registrationId: string;
}

type MoveAction = 'bottom' | 'down' | 'together' | 'top' | 'up';
type OfferFilter = 'active' | 'all' | 'without-active';

async function saveQueueOrder(
  sessionId: string,
  expectedRegistrationIds: string[],
  registrationIds: string[],
  reason: string,
): Promise<ProblemResponse | WaitlistQueueOrderResult> {
  try {
    const response = await fetch(`/api/v1/sessions/${sessionId}/waitlist/order`, {
      body: JSON.stringify({
        expected_registration_ids: expectedRegistrationIds,
        reason,
        registration_ids: registrationIds,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    return (await response.json()) as ProblemResponse | WaitlistQueueOrderResult;
  } catch {
    return { code: 'request_failed', message: 'The waitlist order could not be saved.' };
  }
}

export function WaitlistQueueManager({
  campers,
  sessionId,
}: {
  campers: WaitlistQueueCamper[];
  sessionId: string;
}) {
  const router = useRouter();
  const initialOrder = campers.map((camper) => camper.registrationId);
  const inputSignature = initialOrder.join(':');
  const [baseline, setBaseline] = useState(initialOrder);
  const [order, setOrder] = useState(initialOrder);
  const [reason, setReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [offerFilter, setOfferFilter] = useState<OfferFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('success');
  const camperById = useMemo(
    () => new Map(campers.map((camper) => [camper.registrationId, camper])),
    [campers],
  );
  const queuePositionById = useMemo(
    () => new Map(order.map((registrationId, index) => [registrationId, index + 1])),
    [order],
  );
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('en-US');
  const visibleOrder = useMemo(
    () =>
      order.filter((registrationId) => {
        const camper = camperById.get(registrationId);
        if (!camper) return false;
        const matchesSearch =
          normalizedSearch.length === 0 ||
          `${camper.name} ${camper.familyName}`
            .toLocaleLowerCase('en-US')
            .includes(normalizedSearch);
        const matchesOffer =
          offerFilter === 'all' ||
          (offerFilter === 'active' && camper.hasActiveOffer) ||
          (offerFilter === 'without-active' && !camper.hasActiveOffer);
        return matchesSearch && matchesOffer;
      }),
    [camperById, normalizedSearch, offerFilter, order],
  );
  const dirty = baseline.join(':') !== order.join(':');
  const hasFilters = normalizedSearch.length > 0 || offerFilter !== 'all';

  useEffect(() => {
    const nextOrder = inputSignature.split(':').filter(Boolean);
    setBaseline(nextOrder);
    setOrder(nextOrder);
    setSelected(new Set());
  }, [inputSignature]);

  const toggle = (registrationId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(registrationId)) next.delete(registrationId);
      else next.add(registrationId);
      return next;
    });
  };

  const changeSearchTerm = (value: string) => {
    setSearchTerm(value);
    setSelected(new Set());
  };

  const changeOfferFilter = (value: OfferFilter) => {
    setOfferFilter(value);
    setSelected(new Set());
  };

  const clearFilters = () => {
    setSearchTerm('');
    setOfferFilter('all');
    setSelected(new Set());
  };

  const move = (action: MoveAction) => {
    const selectedIds = order.filter((id) => selected.has(id));
    if (selectedIds.length === 0) return;
    const firstSelectedIndex = order.findIndex((id) => selected.has(id));
    const remaining = order.filter((id) => !selected.has(id));
    const currentInsertionIndex = order
      .slice(0, firstSelectedIndex)
      .filter((id) => !selected.has(id)).length;
    const insertionIndex =
      action === 'top'
        ? 0
        : action === 'bottom'
          ? remaining.length
          : action === 'up'
            ? Math.max(0, currentInsertionIndex - 1)
            : action === 'down'
              ? Math.min(remaining.length, currentInsertionIndex + 1)
              : currentInsertionIndex;
    setOrder([
      ...remaining.slice(0, insertionIndex),
      ...selectedIds,
      ...remaining.slice(insertionIndex),
    ]);
    setMessage(null);
  };

  const reset = () => {
    setOrder(baseline);
    setSelected(new Set());
    setReason('');
    setMessage(null);
  };

  const save = async () => {
    const normalizedReason = reason.trim().replace(/\s+/g, ' ');
    if (normalizedReason.length < 3) {
      setTone('error');
      setMessage('Enter a short reason for changing the queue.');
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await saveQueueOrder(sessionId, baseline, order, normalizedReason);
    setSaving(false);
    if ('code' in result) {
      setTone('error');
      setMessage(result.message);
      return;
    }
    setBaseline([...result.registration_ids]);
    setOrder([...result.registration_ids]);
    setSelected(new Set());
    setReason('');
    setTone('success');
    setMessage('Waitlist order saved. Future offers will follow this queue.');
    router.refresh();
  };

  return (
    <section className="waitlistQueueManager" aria-labelledby="waitlist-queue-heading">
      <div className="waitlistQueueHeader">
        <div>
          <p className="contextLabel">Admin queue controls</p>
          <h3 id="waitlist-queue-heading">Arrange waitlist priority</h3>
          <p>
            Select one or more campers, then move them as a block. Group together keeps the selected
            campers adjacent in their current relative order.
          </p>
        </div>
        <strong>{selected.size} selected</strong>
      </div>

      <div className="waitlistQueueToolbar" aria-label="Queue movement controls">
        <button type="button" disabled={selected.size === 0 || saving} onClick={() => move('top')}>
          <ChevronsUp size={16} aria-hidden="true" />
          Top
        </button>
        <button type="button" disabled={selected.size === 0 || saving} onClick={() => move('up')}>
          <ArrowUp size={16} aria-hidden="true" />
          Up
        </button>
        <button
          type="button"
          disabled={selected.size < 2 || saving}
          onClick={() => move('together')}
        >
          <UsersRound size={16} aria-hidden="true" />
          Group together
        </button>
        <button type="button" disabled={selected.size === 0 || saving} onClick={() => move('down')}>
          <ArrowDown size={16} aria-hidden="true" />
          Down
        </button>
        <button
          type="button"
          disabled={selected.size === 0 || saving}
          onClick={() => move('bottom')}
        >
          <ChevronsDown size={16} aria-hidden="true" />
          Bottom
        </button>
      </div>

      <div className="waitlistQueueFilters" aria-label="Queue filters">
        <label className="waitlistQueueSearch">
          <span>Search waitlist</span>
          <span className="waitlistQueueSearchInput">
            <Search size={16} aria-hidden="true" />
            <input
              disabled={saving}
              maxLength={100}
              onChange={(event) => changeSearchTerm(event.target.value)}
              placeholder="Camper or family name"
              type="search"
              value={searchTerm}
            />
          </span>
        </label>
        <label>
          <span>Offer status</span>
          <select
            disabled={saving}
            onChange={(event) => changeOfferFilter(event.target.value as OfferFilter)}
            value={offerFilter}
          >
            <option value="all">All campers</option>
            <option value="active">Active offers</option>
            <option value="without-active">Without active offer</option>
          </select>
        </label>
        <button
          className="buttonSecondary waitlistQueueClearFilters"
          disabled={!hasFilters || saving}
          onClick={clearFilters}
          type="button"
        >
          <X size={15} aria-hidden="true" />
          Clear filters
        </button>
        <p aria-live="polite">
          Showing <strong>{visibleOrder.length}</strong> of {order.length}
        </p>
      </div>

      <ol className="waitlistQueueList">
        {visibleOrder.map((registrationId) => {
          const camper = camperById.get(registrationId);
          if (!camper) return null;
          return (
            <li key={registrationId} className={selected.has(registrationId) ? 'selected' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(registrationId)}
                  disabled={saving}
                  onChange={() => toggle(registrationId)}
                />
                <span className="waitlistQueuePosition">
                  #{queuePositionById.get(registrationId)}
                </span>
                <span className="waitlistQueueName">
                  <strong>{camper.name}</strong>
                  <small>{camper.familyName}</small>
                </span>
                {camper.hasActiveOffer && <span className="queueOfferBadge">Active offer</span>}
              </label>
            </li>
          );
        })}
      </ol>

      {visibleOrder.length === 0 ? (
        <div className="waitlistQueueEmpty">
          <Search size={22} aria-hidden="true" />
          <strong>No campers match these filters</strong>
          <span>Clear or adjust the search to return to the full queue.</span>
        </div>
      ) : null}

      <p className="waitlistQueueNote">
        Filtering only changes which campers are shown. Queue numbers and movement actions use the
        full queue. Active offers keep their current seat hold; reordering changes future offer
        priority.
      </p>
      <div className="waitlistQueueSaveBar">
        <label>
          <span>Reason for change</span>
          <input
            type="text"
            maxLength={500}
            placeholder="Example: Keep siblings together"
            value={reason}
            disabled={saving}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="inlineActions">
          <button
            className="buttonSecondary"
            type="button"
            disabled={!dirty || saving}
            onClick={reset}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </button>
          <button
            className="buttonPrimary"
            type="button"
            disabled={!dirty || reason.trim().length < 3 || saving}
            onClick={() => void save()}
          >
            <Save size={16} aria-hidden="true" />
            {saving ? 'Saving...' : 'Save order'}
          </button>
        </div>
      </div>
      {message && (
        <div
          className={`notice notice${tone === 'error' ? 'Error' : 'Success'}`}
          role={tone === 'error' ? 'alert' : 'status'}
        >
          {tone === 'error' ? (
            <AlertCircle size={18} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={18} aria-hidden="true" />
          )}
          {message}
        </div>
      )}
    </section>
  );
}
