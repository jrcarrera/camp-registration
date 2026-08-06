'use client';

import type {
  SessionSummary,
  WorkforceListResponse,
  WorkforceProfileDetail,
  WorkforceProfileSummary,
} from '@camp-registration/contracts';
import Link from 'next/link';
import { useState } from 'react';

type Problem = { code: string; message: string };
const blank: {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  preferred_name: string;
  status: 'ACTIVE' | 'PLANNED' | 'INACTIVE';
  workforce_type: 'STAFF' | 'VOLUNTEER';
} = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  preferred_name: '',
  status: 'ACTIVE',
  workforce_type: 'STAFF',
};
async function request<T>(path: string, init?: RequestInit): Promise<T | Problem> {
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  return response.ok ? (response.json() as Promise<T>) : (response.json() as Promise<Problem>);
}
const isProblem = (value: unknown): value is Problem =>
  typeof value === 'object' && value !== null && 'code' in value;

export function WorkforceAdministrationWorkspace({
  initial,
  sessions,
}: {
  initial: WorkforceListResponse;
  sessions: SessionSummary[];
}) {
  const [data, setData] = useState(initial),
    [query, setQuery] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [typeFilter, setTypeFilter] = useState(''),
    [selected, setSelected] = useState<WorkforceProfileDetail | null>(null),
    [form, setForm] = useState({ ...blank }),
    [notice, setNotice] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const refresh = async (page = data.page) => {
    const parameters = new URLSearchParams({
      page: String(page),
      page_size: String(data.page_size),
    });
    if (query.trim()) parameters.set('search', query.trim());
    if (statusFilter) parameters.set('status', statusFilter);
    if (typeFilter) parameters.set('workforce_type', typeFilter);
    const result = await request<WorkforceListResponse>(`v1/workforce?${parameters}`);
    if (!isProblem(result)) setData(result);
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await request<WorkforceProfileDetail>('v1/workforce', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        phone: form.phone || null,
        preferred_name: form.preferred_name || null,
      }),
    });
    setSaving(false);
    if (isProblem(result)) {
      setNotice(result.message);
      return;
    }
    setSelected(result);
    setForm({ ...blank });
    setNotice('Workforce profile created. Workforce status does not grant system access.');
    await refresh();
  };
  const link = async () => {
    if (!selected) return;
    setSaving(true);
    const result = await request<WorkforceProfileDetail>(
      `v1/workforce/${selected.id}/account-link`,
      { method: 'POST', body: JSON.stringify({ version: selected.version }) },
    );
    setSaving(false);
    if (isProblem(result)) {
      setNotice(result.message);
      return;
    }
    setSelected(result);
    setNotice('The existing active organization membership was linked.');
  };
  const addAssignment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const formData = new FormData(e.currentTarget);
    setSaving(true);
    const result = await request<WorkforceProfileDetail>(
      `v1/workforce/${selected.id}/assignments`,
      {
        method: 'POST',
        body: JSON.stringify({
          session_id: formData.get('session_id'),
          position_name: formData.get('position_name'),
          starts_on: formData.get('starts_on'),
          ends_on: formData.get('ends_on'),
          status: formData.get('status'),
        }),
      },
    );
    setSaving(false);
    if (isProblem(result)) {
      setNotice(result.message);
      return;
    }
    setSelected(result);
    setNotice('Session assignment saved.');
    await refresh();
  };
  const updateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const values = new FormData(e.currentTarget);
    setSaving(true);
    const result = await request<WorkforceProfileDetail>(`v1/workforce/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        email: values.get('email'),
        first_name: values.get('first_name'),
        last_name: values.get('last_name'),
        preferred_name: values.get('preferred_name') || null,
        phone: values.get('phone') || null,
        status: values.get('status'),
        version: selected.version,
        workforce_type: values.get('workforce_type'),
      }),
    });
    setSaving(false);
    if (isProblem(result)) {
      setNotice(
        result.code === 'workforce_version_conflict'
          ? 'This profile changed elsewhere. Your edits are still in the form; review and try again.'
          : result.message,
      );
      return;
    }
    setSelected(result);
    setNotice('Workforce profile updated.');
    await refresh();
  };
  const cancelAssignment = async (assignment: WorkforceProfileDetail['assignments'][number]) => {
    if (!selected) return;
    setSaving(true);
    const result = await request<WorkforceProfileDetail>(
      `v1/workforce/${selected.id}/assignments/${assignment.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ends_on: assignment.ends_on,
          position_name: assignment.position_name,
          session_id: assignment.session_id,
          starts_on: assignment.starts_on,
          status: 'CANCELLED',
          version: assignment.version,
        }),
      },
    );
    setSaving(false);
    if (isProblem(result)) {
      setNotice(
        result.code === 'workforce_version_conflict'
          ? 'This assignment changed elsewhere. Reload the profile before retrying.'
          : result.message,
      );
      return;
    }
    setSelected(result);
    setNotice('Assignment cancelled; the history is retained.');
    await refresh();
  };
  const activeStaff = data.profiles.filter(
      (p) => p.status === 'ACTIVE' && p.workforce_type === 'STAFF',
    ).length,
    activeVolunteers = data.profiles.filter(
      (p) => p.status === 'ACTIVE' && p.workforce_type === 'VOLUNTEER',
    ).length;
  return (
    <div className="workspace workforceWorkspace">
      <header>
        <p className="eyebrow">Operations roster</p>
        <h1>Workforce</h1>
        <p>
          Operational roster status is separate from application access. Manage access and
          invitations in <Link href="/settings/access">Access administration</Link>.
        </p>
      </header>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="workforceSummary">
        <p>
          <strong>{activeStaff}</strong> active staff
        </p>
        <p>
          <strong>{activeVolunteers}</strong> active volunteers
        </p>
        <p>
          <strong>
            {data.profiles.filter((p) => p.status === 'ACTIVE' && p.assignment_count === 0).length}
          </strong>{' '}
          unassigned
        </p>
      </div>
      <section className="workforceGrid">
        <form onSubmit={create}>
          <h2>Add profile</h2>
          {(['first_name', 'last_name', 'preferred_name', 'email', 'phone'] as const).map((key) => (
            <label key={key}>
              {key.replace('_', ' ')}
              <input
                required={key === 'first_name' || key === 'last_name' || key === 'email'}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Workforce type
            <select
              value={form.workforce_type}
              onChange={(e) =>
                setForm({ ...form, workforce_type: e.target.value as 'STAFF' | 'VOLUNTEER' })
              }
            >
              <option value="STAFF">Staff</option>
              <option value="VOLUNTEER">Volunteer</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as 'ACTIVE' | 'PLANNED' | 'INACTIVE' })
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="PLANNED">Planned</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <button className="buttonPrimary" disabled={saving}>
            {saving ? 'Saving…' : 'Create profile'}
          </button>
        </form>
        <section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void refresh(1);
            }}
          >
            <label>
              Search workforce
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or email"
              />
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PLANNED">Planned</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label>
              Type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                <option value="STAFF">Staff</option>
                <option value="VOLUNTEER">Volunteer</option>
              </select>
            </label>
            <button type="submit">Apply filters</button>
          </form>
          <h2>Profiles</h2>
          {data.profiles.length === 0 ? (
            <p>No workforce profiles match this view.</p>
          ) : (
            <ul className="workforceList">
              {data.profiles.map((profile: WorkforceProfileSummary) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      const value = await request<WorkforceProfileDetail>(
                        `v1/workforce/${profile.id}`,
                      );
                      if (isProblem(value)) setNotice(value.message);
                      else setSelected(value);
                    }}
                  >
                    <strong>{profile.display_name}</strong>
                    <span>
                      {profile.workforce_type.toLowerCase()} · {profile.status.toLowerCase()} ·{' '}
                      {profile.assignment_count} assignments
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p>
            {data.total} profiles · page {data.page}
          </p>
          <div>
            <button
              type="button"
              disabled={data.page === 1}
              onClick={() => void refresh(data.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={data.page * data.page_size >= data.total}
              onClick={() => void refresh(data.page + 1)}
            >
              Next
            </button>
          </div>
        </section>
      </section>
      {selected && (
        <section className="workforceDetail" aria-live="polite">
          <h2>{selected.display_name}</h2>
          <p>
            {selected.email}
            {selected.phone ? ` · ${selected.phone}` : ''}
          </p>
          <form onSubmit={updateProfile}>
            <h3>Edit profile</h3>
            <label>
              First name
              <input name="first_name" required defaultValue={selected.first_name} />
            </label>
            <label>
              Last name
              <input name="last_name" required defaultValue={selected.last_name} />
            </label>
            <label>
              Preferred name
              <input name="preferred_name" defaultValue={selected.preferred_name ?? ''} />
            </label>
            <label>
              Email
              <input name="email" type="email" required defaultValue={selected.email} />
            </label>
            <label>
              Phone
              <input name="phone" defaultValue={selected.phone ?? ''} />
            </label>
            <label>
              Workforce type
              <select name="workforce_type" defaultValue={selected.workforce_type}>
                <option value="STAFF">Staff</option>
                <option value="VOLUNTEER">Volunteer</option>
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={selected.status}>
                <option value="ACTIVE">Active</option>
                <option value="PLANNED">Planned</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <button type="submit" className="buttonPrimary" disabled={saving}>
              Save profile
            </button>
          </form>
          <p>
            {selected.account_linked
              ? 'Linked to active organization access.'
              : 'No linked account.'}
          </p>
          <button type="button" onClick={link} disabled={saving || selected.account_linked}>
            Link matching account
          </button>
          <h3>Session assignments</h3>
          <ul>
            {selected.assignments.map((assignment) => (
              <li key={assignment.id}>
                {assignment.session_name}: {assignment.position_name} · {assignment.starts_on}–
                {assignment.ends_on} · {assignment.status.toLowerCase()}
                {assignment.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    onClick={() => void cancelAssignment(assignment)}
                    disabled={saving}
                  >
                    Cancel assignment
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={addAssignment}>
            <label>
              Session
              <select name="session_id" required>
                <option value="">Choose a session</option>
                {sessions.map((session) => (
                  <option value={session.id} key={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Position
              <input name="position_name" required maxLength={100} />
            </label>
            <label>
              Starts
              <input name="starts_on" type="date" required />
            </label>
            <label>
              Ends
              <input name="ends_on" type="date" required />
            </label>
            <label>
              Status
              <select name="status">
                <option value="PLANNED">Planned</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <button className="buttonPrimary" disabled={saving}>
              Add assignment
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
