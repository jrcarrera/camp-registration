import type {
  CatalogContext,
  FamilyDetail,
  FamilyListResponse,
  ProblemResponse,
  SessionDetail,
  SessionListResponse,
} from '@camp-registration/contracts';

const apiBaseUrl = process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, apiBaseUrl), { cache: 'no-store' });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new ApiError(problem?.message ?? 'The API request failed.', response.status);
  }
  return (await response.json()) as T;
}

export async function getCatalog(): Promise<CatalogContext> {
  return getJson('/v1/catalog');
}

export async function getSessions(): Promise<SessionListResponse> {
  return getJson('/v1/sessions');
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return getJson(`/v1/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getFamilies(): Promise<FamilyListResponse> {
  return getJson('/v1/families');
}

export async function getFamily(familyId: string): Promise<FamilyDetail> {
  return getJson(`/v1/families/${encodeURIComponent(familyId)}`);
}
