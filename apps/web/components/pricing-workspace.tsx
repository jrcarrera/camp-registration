'use client';

import type {
  CatalogContext,
  Coupon,
  DiscountRule,
  PaymentPlanTemplate,
  PricingConfiguration,
  ProblemResponse,
  SessionAddOn,
  SessionSummary,
} from '@camp-registration/contracts';
import { BadgePercent, CalendarClock, Plus, Ticket, UtensilsCrossed } from 'lucide-react';
import { useState, type FormEvent } from 'react';

interface Props {
  catalog: CatalogContext;
  initial: PricingConfiguration;
  sessions: SessionSummary[];
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}
function isProblem(value: unknown): value is ProblemResponse {
  return Boolean(value && typeof value === 'object' && 'message' in value);
}
async function create<T>(path: string, payload: unknown): Promise<T | ProblemResponse> {
  const response = await fetch(path, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  return (await response.json()) as T | ProblemResponse;
}

export function PricingWorkspace({ catalog, initial, sessions }: Props) {
  const [config, setConfig] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeSeasons = catalog.seasons;

  const submitAddOn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    const sessionId = String(form.get('session_id'));
    const result = await create<SessionAddOn>(`/api/v1/sessions/${sessionId}/add-ons`, {
      active: true,
      description: String(form.get('description') || '') || null,
      name: String(form.get('name')),
      price_cents: Math.round(Number(form.get('price')) * 100),
      required: form.get('required') === 'on',
    });
    setBusy(false);
    if (isProblem(result)) return setMessage(result.message);
    setConfig((current) => ({ ...current, add_ons: [...current.add_ons, result] }));
    formElement.reset();
    setMessage('Session add-on created.');
  };
  const submitDiscount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    const valueType = String(form.get('value_type')) as 'FIXED' | 'PERCENT';
    const result = await create<DiscountRule>('/api/v1/pricing/discount-rules', {
      active: true,
      minimum_qualifying_lines: Number(form.get('minimum')),
      name: String(form.get('name')),
      priority: Number(form.get('priority')),
      rule_type: String(form.get('rule_type')),
      season_id: String(form.get('season_id')),
      value:
        valueType === 'FIXED'
          ? Math.round(Number(form.get('value')) * 100)
          : Math.round(Number(form.get('value')) * 100),
      value_type: valueType,
    });
    setBusy(false);
    if (isProblem(result)) return setMessage(result.message);
    setConfig((current) => ({ ...current, discount_rules: [...current.discount_rules, result] }));
    formElement.reset();
    setMessage('Automatic discount created.');
  };
  const submitCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    const valueType = String(form.get('value_type')) as 'FIXED' | 'PERCENT';
    const result = await create<Coupon>('/api/v1/pricing/coupons', {
      active: true,
      code: String(form.get('code')),
      ends_at: String(form.get('ends_at') || '')
        ? new Date(String(form.get('ends_at'))).toISOString()
        : null,
      maximum_redemptions: Number(form.get('limit')) || null,
      season_id: String(form.get('season_id')),
      starts_at: null,
      value: Math.round(Number(form.get('value')) * 100),
      value_type: valueType,
    });
    setBusy(false);
    if (isProblem(result)) return setMessage(result.message);
    setConfig((current) => ({ ...current, coupons: [...current.coupons, result] }));
    formElement.reset();
    setMessage('Coupon created.');
  };
  const submitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    const first = Math.round(Number(form.get('first_percentage')) * 100);
    const result = await create<PaymentPlanTemplate>('/api/v1/pricing/payment-plans', {
      active: true,
      installments: [
        { due_on: String(form.get('first_due')), percentage_basis_points: first, sequence: 1 },
        {
          due_on: String(form.get('second_due')),
          percentage_basis_points: 10000 - first,
          sequence: 2,
        },
      ],
      name: String(form.get('name')),
      season_id: String(form.get('season_id')),
    });
    setBusy(false);
    if (isProblem(result)) return setMessage(result.message);
    setConfig((current) => ({
      ...current,
      payment_plan_templates: [...current.payment_plan_templates, result],
    }));
    formElement.reset();
    setMessage('Payment plan template created.');
  };

  return (
    <div className="financeWorkspace">
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <section className="contentSection">
        <div className="sectionHeading">
          <div>
            <h2>Session add-ons</h2>
            <p className="sectionDescription">
              Flat-price required or optional selections, snapshotted with each order.
            </p>
          </div>
        </div>
        <form className="financeForm" onSubmit={submitAddOn}>
          <label>
            <span>Session</span>
            <select name="session_id" required>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Add-on name</span>
            <input name="name" required />
          </label>
          <label>
            <span>Price</span>
            <input min="0" name="price" required step="0.01" type="number" />
          </label>
          <label className="toggleField">
            <input name="required" type="checkbox" />
            <span>
              <strong>Required</strong>
              <small>Automatically included for this session.</small>
            </span>
          </label>
          <label className="fullWidth">
            <span>Description</span>
            <input name="description" />
          </label>
          <div className="inlineActions">
            <button className="buttonPrimary" disabled={busy} type="submit">
              <Plus size={16} /> Add session add-on
            </button>
          </div>
        </form>
        <div className="financeCards">
          {config.add_ons.map((item) => (
            <article className="financeCard" key={item.id}>
              <UtensilsCrossed size={18} />
              <h3>{item.name}</h3>
              <p>
                {sessions.find((session) => session.id === item.session_id)?.name ?? 'Session'} ·{' '}
                {money(item.price_cents)}
              </p>
              <small>
                {item.required ? 'Required' : 'Optional'} · {item.active ? 'Active' : 'Inactive'}
              </small>
            </article>
          ))}
        </div>
      </section>
      <section className="contentSection">
        <div className="sectionHeading">
          <div>
            <h2>Automatic discounts</h2>
            <p className="sectionDescription">
              Only the highest-value qualifying sibling or multi-session rule applies.
            </p>
          </div>
        </div>
        <form className="financeForm" onSubmit={submitDiscount}>
          <label>
            <span>Season</span>
            <select name="season_id">
              {activeSeasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} {season.year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Rule name</span>
            <input name="name" required />
          </label>
          <label>
            <span>Rule type</span>
            <select name="rule_type">
              <option value="SIBLING">Sibling</option>
              <option value="MULTI_SESSION">Multi-session</option>
            </select>
          </label>
          <label>
            <span>Value type</span>
            <select name="value_type">
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed dollars</option>
            </select>
          </label>
          <label>
            <span>Value</span>
            <input min="0.01" name="value" required step="0.01" type="number" />
          </label>
          <label>
            <span>Minimum choices</span>
            <input defaultValue="2" max="20" min="2" name="minimum" type="number" />
          </label>
          <label>
            <span>Tie-break priority</span>
            <input defaultValue="100" name="priority" type="number" />
          </label>
          <div className="inlineActions">
            <button className="buttonPrimary" disabled={busy} type="submit">
              <BadgePercent size={16} /> Add discount
            </button>
          </div>
        </form>
        <div className="financeCards">
          {config.discount_rules.map((item) => (
            <article className="financeCard" key={item.id}>
              <BadgePercent size={18} />
              <h3>{item.name}</h3>
              <p>
                {item.rule_type === 'SIBLING' ? 'Sibling' : 'Multi-session'} ·{' '}
                {item.value_type === 'PERCENT' ? `${item.value / 100}%` : money(item.value)}
              </p>
              <small>
                Priority {item.priority} · minimum {item.minimum_qualifying_lines}
              </small>
            </article>
          ))}
        </div>
      </section>
      <section className="contentSection">
        <div className="sectionHeading">
          <div>
            <h2>Coupons</h2>
            <p className="sectionDescription">
              Normalized household codes with season and redemption controls.
            </p>
          </div>
        </div>
        <form className="financeForm" onSubmit={submitCoupon}>
          <label>
            <span>Season</span>
            <select name="season_id">
              {activeSeasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} {season.year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Coupon code</span>
            <input name="code" required />
          </label>
          <label>
            <span>Value type</span>
            <select name="value_type">
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed dollars</option>
            </select>
          </label>
          <label>
            <span>Value</span>
            <input min="0.01" name="value" required step="0.01" type="number" />
          </label>
          <label>
            <span>Total redemption limit</span>
            <input min="1" name="limit" type="number" />
          </label>
          <label>
            <span>Ends at</span>
            <input name="ends_at" type="datetime-local" />
          </label>
          <div className="inlineActions">
            <button className="buttonPrimary" disabled={busy} type="submit">
              <Ticket size={16} /> Add coupon
            </button>
          </div>
        </form>
        <div className="financeCards">
          {config.coupons.map((item) => (
            <article className="financeCard" key={item.id}>
              <Ticket size={18} />
              <h3>{item.code}</h3>
              <p>{item.value_type === 'PERCENT' ? `${item.value / 100}%` : money(item.value)}</p>
              <small>
                {item.maximum_redemptions
                  ? `${item.maximum_redemptions} total uses`
                  : 'Unlimited total uses'}{' '}
                · once per family
              </small>
            </article>
          ))}
        </div>
      </section>
      <section className="contentSection">
        <div className="sectionHeading">
          <div>
            <h2>Payment plans</h2>
            <p className="sectionDescription">
              Parent-initiated installments use a fresh hosted checkout for every payment.
            </p>
          </div>
        </div>
        <form className="financeForm" onSubmit={submitPlan}>
          <label>
            <span>Season</span>
            <select name="season_id">
              {activeSeasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} {season.year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Plan name</span>
            <input name="name" required />
          </label>
          <label>
            <span>First due date</span>
            <input name="first_due" required type="date" />
          </label>
          <label>
            <span>First percentage</span>
            <input
              defaultValue="50"
              max="99"
              min="1"
              name="first_percentage"
              required
              type="number"
            />
          </label>
          <label>
            <span>Second due date</span>
            <input name="second_due" required type="date" />
          </label>
          <div className="inlineActions">
            <button className="buttonPrimary" disabled={busy} type="submit">
              <CalendarClock size={16} /> Add two-installment plan
            </button>
          </div>
        </form>
        <div className="financeCards">
          {config.payment_plan_templates.map((item) => (
            <article className="financeCard" key={item.id}>
              <CalendarClock size={18} />
              <h3>{item.name}</h3>
              <p>{item.installments.length} installments after deposit</p>
              <small>
                {item.installments
                  .map((part) => `${part.due_on}: ${part.percentage_basis_points / 100}%`)
                  .join(' · ')}
              </small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
