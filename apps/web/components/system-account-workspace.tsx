'use client';

import type { AccountSummary, ProblemResponse } from '@camp-registration/contracts';
import { Search, ShieldAlert, UserPlus } from 'lucide-react';
import { useState } from 'react';

export function SystemAccountWorkspace({ currentAccountId }: { currentAccountId: string }) {
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [reason, setReason] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetMfa, setResetMfa] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [administratorEmail, setAdministratorEmail] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function problemMessage(response: Response): Promise<string> {
    return ((await response.json()) as ProblemResponse).message;
  }

  async function searchAccounts() {
    setWorking(true);
    setMessage(null);
    const response = await fetch(`/api/v1/system/accounts?email=${encodeURIComponent(query)}`);
    setWorking(false);
    if (response.ok) {
      setAccounts(((await response.json()) as { accounts: AccountSummary[] }).accounts);
    } else setMessage(await problemMessage(response));
  }

  async function updateStatus(account: AccountSummary) {
    setWorking(true);
    setMessage(null);
    const status = account.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const response = await fetch(
      `/api/v1/system/accounts/${encodeURIComponent(account.id)}/status`,
      {
        body: JSON.stringify({ reason, status }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      },
    );
    setWorking(false);
    if (response.ok) {
      setAccounts((items) =>
        items.map((item) => (item.id === account.id ? { ...item, status } : item)),
      );
      setMessage(status === 'ACTIVE' ? 'Account restored.' : 'Account suspended globally.');
    } else setMessage(await problemMessage(response));
  }

  async function recover(account: AccountSummary) {
    setWorking(true);
    setMessage(null);
    const response = await fetch(
      `/api/v1/system/accounts/${encodeURIComponent(account.id)}/recovery`,
      {
        body: JSON.stringify({
          ...(recoveryEmail ? { email: recoveryEmail } : {}),
          reason,
          reset_mfa: resetMfa,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    setWorking(false);
    if (response.ok) {
      setMessage('Recovery applied and all target sessions revoked.');
      setRecoveryEmail('');
      setResetMfa(false);
    } else setMessage(await problemMessage(response));
  }

  async function inviteOrganizationAdministrator() {
    setWorking(true);
    setMessage(null);
    const response = await fetch(
      `/api/v1/system/organizations/${encodeURIComponent(organizationId)}/administrator-invitations`,
      {
        body: JSON.stringify({ email: administratorEmail }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    setWorking(false);
    if (response.ok) {
      setMessage('Organization administrator invitation sent.');
      setAdministratorEmail('');
    } else setMessage(await problemMessage(response));
  }

  return (
    <div className="identityStack">
      {message ? <div className="notice">{message}</div> : null}
      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Find an account</h2>
          <p>Search requires a normalized full email address.</p>
        </div>
        <div className="identityInviteForm">
          <label>
            Account email
            <input
              disabled={working}
              onChange={(event) => setQuery(event.target.value)}
              type="email"
              value={query}
            />
          </label>
          <label>
            Required reason
            <input
              disabled={working}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <button
            className="buttonSecondary"
            disabled={working || !query}
            onClick={() => void searchAccounts()}
            type="button"
          >
            <Search aria-hidden="true" size={17} />
            Search
          </button>
        </div>
        <div className="identityList">
          {accounts.map((account) => (
            <article className="identityListRow" key={account.id}>
              <ShieldAlert aria-hidden="true" size={19} />
              <div>
                <strong>{account.email}</strong>
                <small>
                  {account.status} · {account.platform_role ?? 'organization account'}
                </small>
                {account.id === currentAccountId ? (
                  <small>Current system administrator</small>
                ) : null}
              </div>
              <div className="buttonRow">
                <button
                  className="buttonSecondary"
                  disabled={working || reason.length < 3 || account.id === currentAccountId}
                  onClick={() => void updateStatus(account)}
                  type="button"
                >
                  {account.status === 'ACTIVE' ? 'Suspend' : 'Restore'}
                </button>
                <button
                  className="buttonSecondary"
                  disabled={
                    working ||
                    reason.length < 3 ||
                    account.id === currentAccountId ||
                    (!recoveryEmail && !resetMfa)
                  }
                  onClick={() => void recover(account)}
                  type="button"
                >
                  Apply recovery
                </button>
              </div>
            </article>
          ))}
        </div>
        {accounts.length ? (
          <div className="fieldGridTwo">
            <label>
              Replacement login email (optional)
              <input
                disabled={working}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                type="email"
                value={recoveryEmail}
              />
            </label>
            <label className="checkRow">
              <input
                checked={resetMfa}
                disabled={working}
                onChange={(event) => setResetMfa(event.target.checked)}
                type="checkbox"
              />
              Reset authenticator enrollment
            </label>
          </div>
        ) : null}
      </section>

      <section className="editorSection">
        <div className="editorSectionHeading">
          <h2>Invite an organization administrator</h2>
          <p>The organization remains the tenant boundary; this grants no platform-wide access.</p>
        </div>
        <div className="identityInviteForm">
          <label>
            Organization ID
            <input
              disabled={working}
              onChange={(event) => setOrganizationId(event.target.value)}
              value={organizationId}
            />
          </label>
          <label>
            Verified email
            <input
              disabled={working}
              onChange={(event) => setAdministratorEmail(event.target.value)}
              type="email"
              value={administratorEmail}
            />
          </label>
          <button
            className="buttonSecondary"
            disabled={working || !organizationId || !administratorEmail}
            onClick={() => void inviteOrganizationAdministrator()}
            type="button"
          >
            <UserPlus aria-hidden="true" size={17} />
            Send invite
          </button>
        </div>
      </section>
    </div>
  );
}
