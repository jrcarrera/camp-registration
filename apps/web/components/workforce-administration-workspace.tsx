'use client';

import type {
  SeasonFixture,
  SessionSummary,
  WorkforceListResponse,
  WorkforceProfileDetail,
  WorkforceProfileSummary,
} from '@camp-registration/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
  try {
    const response = await fetch(`/api/${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    return response.ok
      ? (response.json() as Promise<T>)
      : ((await response.json().catch(() => ({
          code: 'workforce_request_failed',
          message: 'The workforce request could not be completed.',
        }))) as Problem);
  } catch {
    return {
      code: 'workforce_network_error',
      message: 'The workforce service could not be reached.',
    };
  }
}
const isProblem = (value: unknown): value is Problem =>
  typeof value === 'object' && value !== null && 'code' in value;

export function WorkforceAdministrationWorkspace({
  initial,
  seasons,
  sessions,
}: {
  initial: WorkforceListResponse;
  seasons: SeasonFixture[];
  sessions: SessionSummary[];
}) {
  const [data, setData] = useState(initial),
    [query, setQuery] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [typeFilter, setTypeFilter] = useState(''),
    [seasonFilter, setSeasonFilter] = useState(''),
    [sessionFilter, setSessionFilter] = useState(''),
    [selected, setSelected] = useState<WorkforceProfileDetail | null>(null),
    [editingAssignment, setEditingAssignment] = useState<
      WorkforceProfileDetail['assignments'][number] | null
    >(null),
    [assignmentSessionId, setAssignmentSessionId] = useState(''),
    [form, setForm] = useState({ ...blank }),
    [notice, setNotice] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [loadingList, setLoadingList] = useState(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected?.id]);
  const refresh = async (page = data.page) => {
    setLoadingList(true);
    const parameters = new URLSearchParams({
      page: String(page),
      page_size: String(data.page_size),
    });
    if (query.trim()) parameters.set('search', query.trim());
    if (statusFilter) parameters.set('status', statusFilter);
    if (typeFilter) parameters.set('workforce_type', typeFilter);
    if (seasonFilter) parameters.set('season_id', seasonFilter);
    if (sessionFilter) parameters.set('session_id', sessionFilter);
    const result = await request<WorkforceListResponse>(`v1/workforce?${parameters}`);
    if (isProblem(result)) setNotice(result.message);
    else setData(result);
    setLoadingList(false);
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
  const saveAssignment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const formData = new FormData(e.currentTarget);
    setSaving(true);
    const input = {
      session_id: formData.get('session_id'),
      position_name: formData.get('position_name'),
      starts_on: formData.get('starts_on'),
      ends_on: formData.get('ends_on'),
      status: formData.get('status'),
    };
    const result = await request<WorkforceProfileDetail>(
      editingAssignment
        ? `v1/workforce/${selected.id}/assignments/${editingAssignment.id}`
        : `v1/workforce/${selected.id}/assignments`,
      {
        method: editingAssignment ? 'PATCH' : 'POST',
        body: JSON.stringify(
          editingAssignment ? { ...input, version: editingAssignment.version } : input,
        ),
      },
    );
    setSaving(false);
    if (isProblem(result)) {
      setNotice(result.message);
      return;
    }
    setSelected(result);
    setEditingAssignment(null);
    setAssignmentSessionId('');
    setNotice(editingAssignment ? 'Session assignment updated.' : 'Session assignment saved.');
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
          ? 'This profile changed elsewhere. Your edits are still in the form; reload current data before trying again.'
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
  const reloadCurrentProfile = async () => {
    if (!selected) return;
    const value = await request<WorkforceProfileDetail>(`v1/workforce/${selected.id}`);
    if (isProblem(value)) setNotice(value.message);
    else {
      setSelected(value);
      setNotice('Current profile data was reloaded. Review and reapply any intended changes.');
    }
  };
  const selectedAssignmentSession = sessions.find((session) => session.id === assignmentSessionId);
  return (
    <div className="workspace workforceWorkspace">
      <header>
        <p className="eyebrow">Operations roster</p>
        <h1>Workforce</h1>
        <p>
          Operational roster status is separate from application access. Manage access and
          invitations in <Link href="/settings/access">Access administration</Link>. Camp staff can
          use the contact-free <Link href="/workforce/roster">session workforce roster</Link>.
        </p>
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          {notice.includes('reload') || notice.includes('Reload') ? (
            <button type="button" onClick={() => void reloadCurrentProfile()}>
              Reload current profile
            </button>
          ) : null}
        </div>
      )}
      <div className="workforceSummary">
        <p>
          <strong>{data.summary.active_staff}</strong> active staff
        </p>
        <p>
          <strong>{data.summary.active_volunteers}</strong> active volunteers
        </p>
        <p>
          <strong>{data.summary.unassigned_active}</strong> active profiles without a planned or
          confirmed assignment
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
        <section aria-busy={loadingList}>
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
            <label>
              Season
              <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
                <option value="">All seasons</option>
                {seasons.map((season) => (
                  <option value={season.id} key={season.id}>
                    {season.name} ({season.year})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Session
              <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}>
                <option value="">All sessions</option>
                {sessions
                  .filter((session) => !seasonFilter || session.season_id === seasonFilter)
                  .map((session) => (
                    <option value={session.id} key={session.id}>
                      {session.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit">Apply filters</button>
          </form>
          <h2>Profiles {loadingList ? '(loading)' : ''}</h2>
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
          <h2 ref={detailHeading} tabIndex={-1}>
            {selected.display_name}
          </h2>
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
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAssignment(assignment);
                        setAssignmentSessionId(assignment.session_id);
                      }}
                      disabled={saving}
                      aria-label={`Edit ${assignment.position_name} assignment for ${assignment.session_name}`}
                    >
                      Edit assignment
                    </button>
                    <button
                      type="button"
                      onClick={() => void cancelAssignment(assignment)}
                      disabled={saving}
                      aria-label={`Cancel ${assignment.position_name} assignment for ${assignment.session_name}`}
                    >
                      Cancel assignment
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form key={editingAssignment?.id ?? 'new'} onSubmit={saveAssignment}>
            <h4>{editingAssignment ? 'Edit assignment' : 'Add assignment'}</h4>
            <label>
              Session
              <select
                name="session_id"
                required
                defaultValue={editingAssignment?.session_id ?? ''}
                onChange={(event) => setAssignmentSessionId(event.target.value)}
              >
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
              <input
                name="position_name"
                required
                maxLength={100}
                defaultValue={editingAssignment?.position_name ?? ''}
              />
            </label>
            <label>
              Starts
              <input
                name="starts_on"
                type="date"
                required
                min={selectedAssignmentSession?.starts_on}
                max={selectedAssignmentSession?.ends_on}
                defaultValue={editingAssignment?.starts_on ?? ''}
              />
            </label>
            <label>
              Ends
              <input
                name="ends_on"
                type="date"
                required
                min={selectedAssignmentSession?.starts_on}
                max={selectedAssignmentSession?.ends_on}
                defaultValue={editingAssignment?.ends_on ?? ''}
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={editingAssignment?.status ?? 'PLANNED'}>
                <option value="PLANNED">Planned</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <button className="buttonPrimary" disabled={saving}>
              {editingAssignment ? 'Save assignment' : 'Add assignment'}
            </button>
            {editingAssignment ? (
              <button
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setAssignmentSessionId('');
                }}
                disabled={saving}
              >
                Cancel editing
              </button>
            ) : null}
          </form>
        </section>
      )}
    </div>
  );
}
