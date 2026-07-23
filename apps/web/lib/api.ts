import type {
  CatalogContext,
  CommunicationsCenter,
  FamilyDetail,
  FamilyListResponse,
  FinancialAssistanceListResponse,
  FormTemplatesResponse,
  ParentFormObligationsResponse,
  PaymentAttemptListResponse,
  HouseholdOrderListResponse,
  HousingInventory,
  PricingConfiguration,
  ProblemResponse,
  OperationalReportCenter,
  SessionDetail,
  SessionListResponse,
  SessionHousing,
  WaitlistOperationsStatus,
} from '@camp-registration/contracts';

const apiBaseUrl = process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3001';

export type ApiHeaders = Record<string, string>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, headers?: ApiHeaders): Promise<T> {
  const init: RequestInit = { cache: 'no-store' };
  if (headers) init.headers = headers;
  const response = await fetch(new URL(path, apiBaseUrl), init);
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new ApiError(problem?.message ?? 'The API request failed.', response.status);
  }
  return (await response.json()) as T;
}

export function getParentApiHeaders(): ApiHeaders {
  const headers: ApiHeaders = {
    'x-local-actor-id': process.env.LOCAL_PARENT_ACTOR_ID ?? 'local-parent-avery',
    'x-local-email': process.env.LOCAL_PARENT_EMAIL ?? 'winter.family001.adult1@example.test',
    'x-local-email-verified': 'true',
    'x-local-roles': 'parent_guardian',
  };
  if (process.env.LOCAL_ORGANIZATION_ID) {
    headers['x-local-organization-id'] = process.env.LOCAL_ORGANIZATION_ID;
  }
  return headers;
}

export async function getCatalog(): Promise<CatalogContext> {
  return getJson('/v1/catalog');
}

export async function getCommunications(): Promise<CommunicationsCenter> {
  return getJson('/v1/communications');
}

export async function getReports(): Promise<OperationalReportCenter> {
  return getJson('/v1/reports');
}

export async function getParentCatalog(headers = getParentApiHeaders()): Promise<CatalogContext> {
  return getJson('/v1/catalog', headers);
}

export async function getSessions(): Promise<SessionListResponse> {
  return getJson('/v1/sessions');
}

export async function getWaitlistOperations(): Promise<WaitlistOperationsStatus> {
  return getJson('/v1/operations/waitlist');
}

export async function getPaymentAttempts(): Promise<PaymentAttemptListResponse> {
  return getJson('/v1/payments');
}

export async function getOrders(): Promise<HouseholdOrderListResponse> {
  return getJson('/v1/orders');
}

export async function getPricing(): Promise<PricingConfiguration> {
  return getJson('/v1/pricing');
}

export async function getHousing(): Promise<HousingInventory> {
  return getJson('/v1/housing');
}

export async function getSessionHousing(sessionId: string): Promise<SessionHousing> {
  return getJson(`/v1/sessions/${encodeURIComponent(sessionId)}/housing`);
}

export async function getFinancialAssistance(): Promise<FinancialAssistanceListResponse> {
  return getJson('/v1/financial-assistance');
}

export async function getForms(): Promise<FormTemplatesResponse> {
  return getJson('/v1/forms');
}

export async function getParentForms(
  headers = getParentApiHeaders(),
): Promise<ParentFormObligationsResponse> {
  return getJson('/v1/portal/forms', headers);
}

export async function getParentPricing(
  headers = getParentApiHeaders(),
): Promise<PricingConfiguration> {
  return getJson('/v1/pricing', headers);
}

export async function getParentOrders(
  familyId: string,
  headers = getParentApiHeaders(),
): Promise<HouseholdOrderListResponse> {
  return getJson(`/v1/families/${encodeURIComponent(familyId)}/orders`, headers);
}

export async function getParentFinancialAssistance(
  familyId: string,
  headers = getParentApiHeaders(),
): Promise<FinancialAssistanceListResponse> {
  return getJson(`/v1/families/${encodeURIComponent(familyId)}/financial-assistance`, headers);
}

export async function getParentSessions(
  headers = getParentApiHeaders(),
): Promise<SessionListResponse> {
  return getJson('/v1/sessions', headers);
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return getJson(`/v1/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getParentSession(
  sessionId: string,
  headers = getParentApiHeaders(),
): Promise<SessionDetail> {
  return getJson(`/v1/sessions/${encodeURIComponent(sessionId)}`, headers);
}

export async function getFamilies(): Promise<FamilyListResponse> {
  return getJson('/v1/families');
}

export async function getParentFamilies(
  headers = getParentApiHeaders(),
): Promise<FamilyListResponse> {
  return getJson('/v1/families', headers);
}

export async function getFamily(familyId: string): Promise<FamilyDetail> {
  return getJson(`/v1/families/${encodeURIComponent(familyId)}`);
}

export async function getParentFamily(
  familyId: string,
  headers = getParentApiHeaders(),
): Promise<FamilyDetail> {
  return getJson(`/v1/families/${encodeURIComponent(familyId)}`, headers);
}
