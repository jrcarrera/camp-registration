'use client';

import type {
  HousingInventory,
  ProblemResponse,
  SessionHousing,
  SessionSummary,
} from '@camp-registration/contracts';
import { AlertCircle, BedDouble, Building2, Plus, Sparkles, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

function isProblem(value: unknown): value is ProblemResponse {
  return Boolean(value && typeof value === 'object' && 'message' in value);
}
async function request<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T | ProblemResponse> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const response = await fetch(`/api${path}`, init);
  return (await response.json()) as T | ProblemResponse;
}
function age(birthDate: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(`${birthDate}T12:00:00`).getTime()) / 31_557_600_000),
  );
}

export function HousingWorkspace({
  initialHousing,
  initialInventory,
  sessions,
}: {
  initialHousing: SessionHousing | null;
  initialInventory: HousingInventory;
  sessions: SessionSummary[];
}) {
  const [inventory, setInventory] = useState(initialInventory);
  const [housing, setHousing] = useState(initialHousing);
  const [sessionId, setSessionId] = useState(initialHousing?.session_id ?? sessions[0]?.id ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const availableBuildings = useMemo(
    () =>
      inventory.buildings.filter(
        (building) =>
          building.active && !housing?.buildings.some((item) => item.building_id === building.id),
      ),
    [housing, inventory],
  );

  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    const result = await request<SessionHousing>(path, method, body);
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      return;
    }
    setHousing(result);
  }
  async function selectSession(id: string) {
    setSessionId(id);
    setBusy(true);
    setMessage(null);
    const result = await request<SessionHousing>(`/v1/sessions/${id}/housing`, 'GET');
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      return;
    }
    setHousing(result);
  }
  async function addBuilding(form: FormData) {
    setBusy(true);
    setMessage(null);
    const result = await request<HousingInventory['buildings'][number]>(
      '/v1/housing/buildings',
      'POST',
      {
        code: String(form.get('code') ?? ''),
        name: String(form.get('name') ?? ''),
        description: null,
        active: true,
      },
    );
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      return;
    }
    setInventory((current) => ({ buildings: [...current.buildings, result] }));
  }
  async function addBed(buildingId: string, form: FormData) {
    setBusy(true);
    setMessage(null);
    const result = await request<HousingInventory['buildings'][number]['beds'][number]>(
      `/v1/housing/buildings/${buildingId}/beds`,
      'POST',
      { name: String(form.get('name') ?? ''), active: true },
    );
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      return;
    }
    setInventory((current) => ({
      buildings: current.buildings.map((building) =>
        building.id === buildingId ? { ...building, beds: [...building.beds, result] } : building,
      ),
    }));
    if (housing?.buildings.some((building) => building.building_id === buildingId))
      await selectSession(sessionId);
  }

  return (
    <div className="housingWorkspace">
      {message && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} /> {message}
        </div>
      )}
      <section className="housingInventory contentSection">
        <div className="sectionHeading">
          <div>
            <p className="contextLabel">Reusable inventory</p>
            <h2>Buildings and beds</h2>
            <p className="sectionDescription">Buildings can serve many non-overlapping sessions.</p>
          </div>
        </div>
        <form action={addBuilding} className="housingInlineForm">
          <label>
            <span>Building name</span>
            <input name="name" placeholder="North Cabin" required />
          </label>
          <label>
            <span>Code</span>
            <input maxLength={32} name="code" placeholder="NORTH" required />
          </label>
          <button className="buttonPrimary" disabled={busy} type="submit">
            <Plus size={16} /> Add building
          </button>
        </form>
        <div className="housingBuildingGrid">
          {inventory.buildings.map((building) => (
            <article className="housingBuildingCard" key={building.id}>
              <header>
                <Building2 size={20} />
                <div>
                  <strong>{building.name}</strong>
                  <small>
                    {building.code} · {building.beds.filter((bed) => bed.active).length} beds
                  </small>
                </div>
              </header>
              <div className="bedPills">
                {building.beds.map((bed) => (
                  <span key={bed.id}>
                    <BedDouble size={13} /> {bed.name}
                  </span>
                ))}
              </div>
              <form action={(form) => addBed(building.id, form)} className="housingBedForm">
                <input
                  aria-label={`New bed in ${building.name}`}
                  name="name"
                  placeholder="Bed 1"
                  required
                />
                <button className="buttonSecondary" disabled={busy} type="submit">
                  <Plus size={15} /> Bed
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>

      <section className="sessionHousing contentSection">
        <div className="sectionHeading">
          <div>
            <p className="contextLabel">Pre-session planning</p>
            <h2>Session assignments</h2>
          </div>
          <label>
            <span>Session</span>
            <select onChange={(event) => selectSession(event.target.value)} value={sessionId}>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="housingToolbar">
          <label>
            <span>Add a building</span>
            <select
              defaultValue=""
              disabled={!availableBuildings.length}
              onChange={(event) => {
                if (event.target.value)
                  mutate(
                    `/v1/sessions/${sessionId}/housing/buildings/${event.target.value}`,
                    'PUT',
                    { status: 'OPEN', closed_reason: null },
                  );
                event.target.value = '';
              }}
            >
              <option value="">Choose building…</option>
              {availableBuildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name} · {building.beds.length} beds
                </option>
              ))}
            </select>
          </label>
          <button
            className="buttonSecondary"
            disabled={busy || !housing?.campers.some((camper) => !camper.assignment_id)}
            onClick={() =>
              mutate(`/v1/sessions/${sessionId}/housing/auto-assign`, 'POST', {
                strategy: 'BALANCED',
              })
            }
            type="button"
          >
            <Sparkles size={16} /> Balance across buildings
          </button>
          <button
            className="buttonSecondary"
            disabled={busy || !housing?.campers.some((camper) => !camper.assignment_id)}
            onClick={() =>
              mutate(`/v1/sessions/${sessionId}/housing/auto-assign`, 'POST', {
                strategy: 'CONSOLIDATE',
              })
            }
            type="button"
          >
            <Building2 size={16} /> Fill and close extras
          </button>
        </div>
        {housing?.warnings.map((warning) => (
          <div className="notice" key={warning}>
            <AlertCircle size={17} /> {warning}
          </div>
        ))}
        <div className="housingStats">
          <span>
            <Users size={16} /> {housing?.campers.length ?? 0} confirmed
          </span>
          <span>
            {housing?.campers.filter((camper) => camper.assignment_id).length ?? 0} assigned
          </span>
          <span>
            {housing?.campers.filter((camper) => !camper.assignment_id).length ?? 0} unassigned
          </span>
        </div>
        <div className="housingPlacementGrid">
          <div className="unassignedCampers">
            <h3>Unassigned campers</h3>
            {housing?.campers
              .filter((camper) => !camper.assignment_id)
              .map((camper) => (
                <article key={camper.registration_id}>
                  <div>
                    <strong>{camper.camper_name}</strong>
                    <small>
                      Age {age(camper.birth_date)}
                      {camper.bunk_buddy_names.length
                        ? ` · Buddies: ${camper.bunk_buddy_names.join(', ')}`
                        : ''}
                    </small>
                  </div>
                  <select
                    aria-label={`Assign ${camper.camper_name}`}
                    defaultValue=""
                    onChange={(event) =>
                      event.target.value &&
                      mutate(`/v1/sessions/${sessionId}/housing/assignments`, 'POST', {
                        registration_id: camper.registration_id,
                        bed_id: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose bed…</option>
                    {housing.buildings
                      .filter((building) => building.status === 'OPEN')
                      .flatMap((building) =>
                        building.beds
                          .filter(
                            (bed) =>
                              bed.active && !housing.campers.some((item) => item.bed_id === bed.id),
                          )
                          .map((bed) => (
                            <option key={bed.id} value={bed.id}>
                              {building.name} · {bed.name}
                            </option>
                          )),
                      )}
                  </select>
                </article>
              ))}
          </div>
          <div className="assignedBuildings">
            {housing?.buildings.map((building) => (
              <article
                className={`assignedBuilding ${building.status === 'CLOSED' ? 'isClosed' : ''}`}
                key={building.id}
              >
                <header>
                  <div>
                    <strong>{building.name}</strong>
                    <small>
                      {building.assigned_count}/{building.beds.filter((bed) => bed.active).length}{' '}
                      beds · {building.status.toLowerCase()}
                    </small>
                  </div>
                  <button
                    className="buttonText"
                    disabled={busy || building.assigned_count > 0}
                    onClick={() =>
                      mutate(
                        `/v1/sessions/${sessionId}/housing/buildings/${building.building_id}`,
                        'PUT',
                        {
                          status: building.status === 'OPEN' ? 'CLOSED' : 'OPEN',
                          closed_reason:
                            building.status === 'OPEN' ? 'Closed by administrator' : null,
                        },
                      )
                    }
                    type="button"
                  >
                    {building.status === 'OPEN' ? 'Close' : 'Open'}
                  </button>
                </header>
                <div>
                  {building.beds.map((bed) => {
                    const camper = housing.campers.find((item) => item.bed_id === bed.id);
                    return (
                      <span className="housingBedRow" key={bed.id}>
                        <BedDouble size={15} />
                        <strong>{bed.name}</strong>
                        {camper ? (
                          <>
                            <span>
                              {camper.camper_name} · age {age(camper.birth_date)}
                            </span>
                            <button
                              aria-label={`Unassign ${camper.camper_name}`}
                              className="buttonText"
                              onClick={() =>
                                mutate(
                                  `/v1/sessions/${sessionId}/housing/assignments/${camper.assignment_id}`,
                                  'DELETE',
                                )
                              }
                              type="button"
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <span>Available</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
