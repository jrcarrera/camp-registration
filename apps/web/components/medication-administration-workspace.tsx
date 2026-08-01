'use client';

import type {
  MedicationAdministration,
  MedicationAdministrationCenter,
  MedicationAdministrationOutcome,
  MedicationOrder,
  MedicationScheduleType,
  ProblemResponse,
} from '@camp-registration/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Pill,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

interface Props {
  initialCenter: MedicationAdministrationCenter;
}

interface OrderForm {
  candidate: string;
  dose: string;
  ends_on: string;
  instructions: string;
  medication_name: string;
  schedule_type: MedicationScheduleType;
  starts_on: string;
  times: string[];
}

interface SelectedAdministration {
  orderId: string;
  scheduledFor: string | null;
}

function localDateTime(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function label(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function dateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: timezone,
    timeZoneName: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const request: RequestInit = { ...init, cache: 'no-store' };
  if (init.body) request.headers = { 'content-type': 'application/json' };
  const response = await fetch(path, request);
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new Error(problem?.message ?? 'The restricted medication request failed.');
  }
  return (await response.json()) as T;
}

export function MedicationAdministrationWorkspace({ initialCenter }: Props) {
  const [center, setCenter] = useState(initialCenter);
  const [form, setForm] = useState<OrderForm>({
    candidate: '',
    dose: '',
    ends_on: initialCenter.date,
    instructions: '',
    medication_name: '',
    schedule_type: 'SCHEDULED',
    starts_on: initialCenter.date,
    times: ['08:00'],
  });
  const [selected, setSelected] = useState<SelectedAdministration | null>(null);
  const [outcome, setOutcome] = useState<MedicationAdministrationOutcome>('GIVEN');
  const [note, setNote] = useState('');
  const [administeredAt, setAdministeredAt] = useState(localDateTime());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('success');

  const orderById = useMemo(
    () => new Map(center.orders.map((order) => [order.id, order])),
    [center.orders],
  );
  const activePrnOrders = center.orders.filter(
    (order) => order.status === 'ACTIVE' && order.schedule_type === 'PRN',
  );

  function showError(error: unknown, fallback: string) {
    setTone('error');
    setMessage(error instanceof Error ? error.message : fallback);
  }

  async function refresh(date = center.date) {
    const query = new URLSearchParams({ date });
    const next = await jsonRequest<MedicationAdministrationCenter>(
      `/api/v1/medication-administration?${query}`,
    );
    setCenter(next);
    setSelected(null);
  }

  async function changeDate(date: string) {
    setBusy(true);
    setMessage(null);
    try {
      await refresh(date);
    } catch (error) {
      showError(error, 'The medication round could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  function updateTime(index: number, value: string) {
    setForm((current) => ({
      ...current,
      times: current.times.map((time, timeIndex) => (timeIndex === index ? value : time)),
    }));
  }

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    const [camperId, sessionId] = form.candidate.split('|');
    if (!camperId || !sessionId) {
      showError(null, 'Select a camper and session.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await jsonRequest<MedicationOrder>('/api/v1/medication-administration/orders', {
        body: JSON.stringify({
          administration_times:
            form.schedule_type === 'SCHEDULED' ? form.times.filter(Boolean) : [],
          camper_id: camperId,
          dose: form.dose,
          ends_on: form.ends_on,
          instructions: form.instructions,
          medication_name: form.medication_name,
          schedule_type: form.schedule_type,
          session_id: sessionId,
          starts_on: form.starts_on,
        }),
        method: 'POST',
      });
      await refresh();
      setForm({
        candidate: '',
        dose: '',
        ends_on: center.date,
        instructions: '',
        medication_name: '',
        schedule_type: 'SCHEDULED',
        starts_on: center.date,
        times: ['08:00'],
      });
      setTone('success');
      setMessage('Medication order added to the restricted round.');
    } catch (error) {
      showError(error, 'The medication order could not be created.');
    } finally {
      setBusy(false);
    }
  }

  function chooseAdministration(orderId: string, scheduledFor: string | null) {
    setSelected({ orderId, scheduledFor });
    setOutcome('GIVEN');
    setNote('');
    setAdministeredAt(localDateTime());
    requestAnimationFrame(() =>
      document.getElementById('medication-record-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      }),
    );
  }

  async function recordAdministration(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await jsonRequest<MedicationAdministration>(
        `/api/v1/medication-administration/orders/${selected.orderId}/administrations`,
        {
          body: JSON.stringify({
            administered_at: new Date(administeredAt).toISOString(),
            note,
            outcome,
            scheduled_for: selected.scheduledFor,
          }),
          method: 'POST',
        },
      );
      await refresh();
      setTone('success');
      setMessage('Medication administration appended to the permanent round history.');
    } catch (error) {
      showError(error, 'The medication administration could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  async function discontinue(order: MedicationOrder) {
    setBusy(true);
    setMessage(null);
    try {
      await jsonRequest<MedicationOrder>(
        `/api/v1/medication-administration/orders/${order.id}/discontinue`,
        {
          body: JSON.stringify({ version: order.version }),
          method: 'POST',
        },
      );
      await refresh();
      setTone('success');
      setMessage('Medication order discontinued; prior administrations remain unchanged.');
    } catch (error) {
      showError(error, 'The medication order could not be discontinued.');
    } finally {
      setBusy(false);
    }
  }

  const selectedOrder = selected ? orderById.get(selected.orderId) : undefined;

  return (
    <div className="medicationWorkspace">
      <section className="contentSection healthPrivacyNotice" aria-label="Restricted data notice">
        <LockKeyhole size={20} aria-hidden="true" />
        <div>
          <strong>Restricted medication data</strong>
          <p>
            Medication, dose, instructions, and notes are encrypted. Access requires an authorized
            health role with MFA, and every round action is audited.
          </p>
        </div>
      </section>

      {message && (
        <div
          className={`notice ${tone === 'error' ? 'noticeError' : 'noticeSuccess'}`}
          role="status"
        >
          {tone === 'error' ? (
            <AlertTriangle size={18} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={18} aria-hidden="true" />
          )}
          {message}
        </div>
      )}

      <section className="contentSection" aria-labelledby="medication-order-heading">
        <div className="sectionHeader">
          <div>
            <p className="contextLabel">Health center</p>
            <h2 id="medication-order-heading">Add medication order</h2>
          </div>
          <Pill size={22} aria-hidden="true" />
        </div>
        <form className="medicationOrderForm" onSubmit={createOrder}>
          <label className="formField medicationCandidateField">
            <span>Camper and session</span>
            <select
              required
              value={form.candidate}
              onChange={(event) =>
                setForm((current) => ({ ...current, candidate: event.target.value }))
              }
            >
              <option value="">Select a confirmed camper</option>
              {center.candidates.map((candidate) => (
                <option
                  key={`${candidate.camper_id}|${candidate.session_id}`}
                  value={`${candidate.camper_id}|${candidate.session_id}`}
                >
                  {candidate.camper_name} — {candidate.session_name} ({candidate.family_name})
                </option>
              ))}
            </select>
          </label>
          <label className="formField">
            <span>Schedule</span>
            <select
              value={form.schedule_type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  schedule_type: event.target.value as MedicationScheduleType,
                }))
              }
            >
              <option value="SCHEDULED">Scheduled</option>
              <option value="PRN">As needed (PRN)</option>
            </select>
          </label>
          <label className="formField">
            <span>Medication</span>
            <input
              required
              maxLength={200}
              value={form.medication_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, medication_name: event.target.value }))
              }
            />
          </label>
          <label className="formField">
            <span>Dose</span>
            <input
              required
              maxLength={200}
              value={form.dose}
              onChange={(event) => setForm((current) => ({ ...current, dose: event.target.value }))}
            />
          </label>
          <label className="formField">
            <span>Starts on</span>
            <input
              required
              type="date"
              value={form.starts_on}
              onChange={(event) =>
                setForm((current) => ({ ...current, starts_on: event.target.value }))
              }
            />
          </label>
          <label className="formField">
            <span>Ends on</span>
            <input
              required
              type="date"
              value={form.ends_on}
              onChange={(event) =>
                setForm((current) => ({ ...current, ends_on: event.target.value }))
              }
            />
          </label>
          {form.schedule_type === 'SCHEDULED' && (
            <fieldset className="medicationTimes">
              <legend>Administration times</legend>
              {form.times.map((time, index) => (
                <div key={index}>
                  <label>
                    <span className="srOnly">Administration time {index + 1}</span>
                    <input
                      required
                      aria-label={`Administration time ${index + 1}`}
                      type="time"
                      value={time}
                      onChange={(event) => updateTime(index, event.target.value)}
                    />
                  </label>
                  {form.times.length > 1 && (
                    <button
                      className="buttonGhost"
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          times: current.times.filter((_, timeIndex) => timeIndex !== index),
                        }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {form.times.length < 8 && (
                <button
                  className="buttonSecondary"
                  type="button"
                  onClick={() =>
                    setForm((current) => ({ ...current, times: [...current.times, '12:00'] }))
                  }
                >
                  <Plus size={16} aria-hidden="true" /> Add time
                </button>
              )}
            </fieldset>
          )}
          <label className="formField medicationInstructionsField">
            <span>Instructions</span>
            <textarea
              maxLength={2000}
              rows={3}
              value={form.instructions}
              onChange={(event) =>
                setForm((current) => ({ ...current, instructions: event.target.value }))
              }
            />
          </label>
          <button className="buttonPrimary" disabled={busy} type="submit">
            <ShieldCheck size={17} aria-hidden="true" />
            {busy ? 'Saving…' : 'Add medication order'}
          </button>
        </form>
      </section>

      <section className="contentSection" aria-labelledby="medication-round-heading">
        <div className="sectionHeader medicationRoundHeader">
          <div>
            <p className="contextLabel">Daily safety round</p>
            <h2 id="medication-round-heading">Medication round</h2>
          </div>
          <label className="formField medicationDateField">
            <span>Round date</span>
            <input
              type="date"
              value={center.date}
              onChange={(event) => void changeDate(event.target.value)}
            />
          </label>
        </div>

        <div className="medicationRoundGrid">
          <div>
            <h3>Scheduled doses</h3>
            <div className="medicationDoseStack">
              {center.scheduled_doses.length === 0 && (
                <p className="emptyState">No scheduled doses for this date.</p>
              )}
              {center.scheduled_doses.map((dose) => {
                const order = orderById.get(dose.order_id);
                if (!order) return null;
                return (
                  <article
                    className={`medicationDoseCard${dose.administration ? ' completed' : ''}`}
                    key={`${dose.order_id}|${dose.scheduled_for}`}
                  >
                    <div>
                      <strong>{order.camper_name}</strong>
                      <small>{order.session_name}</small>
                    </div>
                    <div>
                      <strong>
                        {order.medication_name} · {order.dose}
                      </strong>
                      <small>{dateTime(dose.scheduled_for, center.timezone)}</small>
                    </div>
                    {dose.administration ? (
                      <span className={`statusBadge status${dose.administration.outcome}`}>
                        {label(dose.administration.outcome)}
                      </span>
                    ) : (
                      <button
                        className="buttonSecondary"
                        disabled={busy}
                        type="button"
                        onClick={() => chooseAdministration(order.id, dose.scheduled_for)}
                      >
                        Record dose
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          <div>
            <h3>As-needed orders</h3>
            <div className="medicationDoseStack">
              {activePrnOrders.length === 0 && (
                <p className="emptyState">No active PRN orders for this date.</p>
              )}
              {activePrnOrders.map((order) => (
                <article className="medicationDoseCard medicationPrnCard" key={order.id}>
                  <div>
                    <strong>{order.camper_name}</strong>
                    <small>{order.session_name}</small>
                  </div>
                  <div>
                    <strong>
                      {order.medication_name} · {order.dose}
                    </strong>
                    <small>{order.instructions || 'No additional instructions'}</small>
                  </div>
                  <button
                    className="buttonSecondary"
                    disabled={busy}
                    type="button"
                    onClick={() => chooseAdministration(order.id, null)}
                  >
                    Record PRN
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>

        {selectedOrder && (
          <form
            className="medicationAdministrationForm"
            id="medication-record-form"
            onSubmit={recordAdministration}
          >
            <div>
              <p className="contextLabel">Append administration</p>
              <h3>
                {selectedOrder.camper_name} · {selectedOrder.medication_name} {selectedOrder.dose}
              </h3>
              {selected?.scheduledFor && (
                <p>Scheduled {dateTime(selected.scheduledFor, center.timezone)}</p>
              )}
            </div>
            <label className="formField">
              <span>Outcome</span>
              <select
                value={outcome}
                onChange={(event) =>
                  setOutcome(event.target.value as MedicationAdministrationOutcome)
                }
              >
                <option value="GIVEN">Given</option>
                <option value="REFUSED">Refused</option>
                <option value="HELD">Held</option>
                <option value="MISSED">Missed</option>
              </select>
            </label>
            <label className="formField">
              <span>Administered at (your local time)</span>
              <input
                required
                type="datetime-local"
                value={administeredAt}
                onChange={(event) => setAdministeredAt(event.target.value)}
              />
            </label>
            <label className="formField medicationAdministrationNote">
              <span>Note {outcome === 'GIVEN' ? '(optional)' : '(required)'}</span>
              <textarea
                required={outcome !== 'GIVEN'}
                maxLength={2000}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <button className="buttonPrimary" disabled={busy} type="submit">
              {busy ? 'Recording…' : 'Record administration'}
            </button>
          </form>
        )}
      </section>

      <section className="contentSection" aria-labelledby="medication-history-heading">
        <div className="sectionHeader">
          <div>
            <p className="contextLabel">Append-only record</p>
            <h2 id="medication-history-heading">Round history</h2>
          </div>
          <Clock3 size={22} aria-hidden="true" />
        </div>
        <div className="medicationHistory">
          {center.administrations.length === 0 && (
            <p className="emptyState">No administrations recorded for this date.</p>
          )}
          {center.administrations.map((administration) => {
            const order = orderById.get(administration.order_id);
            if (!order) return null;
            return (
              <article key={administration.id}>
                <div>
                  <strong>
                    {order.camper_name} · {order.medication_name} {order.dose}
                  </strong>
                  <small>
                    {dateTime(administration.administered_at, center.timezone)} by{' '}
                    {administration.administered_by}
                  </small>
                </div>
                <span className={`statusBadge status${administration.outcome}`}>
                  {label(administration.outcome)}
                </span>
                {administration.note && <p>{administration.note}</p>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="contentSection" aria-labelledby="medication-active-orders-heading">
        <div className="sectionHeader">
          <div>
            <p className="contextLabel">Order controls</p>
            <h2 id="medication-active-orders-heading">Orders in this round</h2>
          </div>
        </div>
        <div className="medicationOrderList">
          {center.orders.map((order) => (
            <article key={order.id}>
              <div>
                <strong>
                  {order.camper_name} · {order.medication_name} {order.dose}
                </strong>
                <small>
                  {order.session_name} · {label(order.schedule_type)} · {order.starts_on} through{' '}
                  {order.ends_on}
                </small>
              </div>
              <span className={`statusBadge status${order.status}`}>{label(order.status)}</span>
              {order.status === 'ACTIVE' && (
                <button
                  className="buttonGhost"
                  disabled={busy}
                  type="button"
                  onClick={() => void discontinue(order)}
                >
                  Discontinue
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
