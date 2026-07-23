import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const apiBaseUrl = process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3001';
  const target = new URL(path.join('/'), `${apiBaseUrl.replace(/\/$/, '')}/`);
  target.search = request.nextUrl.search;

  const requestBody =
    request.method === 'GET' || request.method === 'HEAD' ? null : await request.text();
  const body = requestBody && requestBody.length > 0 ? requestBody : null;
  const headers = new Headers({
    accept: request.headers.get('accept') ?? 'application/json',
    'x-request-id': request.headers.get('x-request-id') ?? crypto.randomUUID(),
  });
  if (body !== null) {
    headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
  }
  for (const header of [
    'x-local-actor-id',
    'x-local-email',
    'x-local-email-verified',
    'x-local-mfa-verified',
    'x-local-organization-id',
    'x-local-roles',
  ]) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }
  const response = await fetch(target, {
    ...(body === null ? {} : { body }),
    headers,
    method: request.method,
  });

  if (response.ok && request.method !== 'GET' && request.method !== 'HEAD') {
    revalidatePath('/');
    revalidatePath('/families');
    revalidatePath('/forms');
    revalidatePath('/portal');
    revalidatePath('/portal/forms');
    revalidatePath('/sessions');
    if (path[0] === 'v1' && path[1] === 'sessions' && path[2]) {
      revalidatePath(`/sessions/${path[2]}`);
    }
    revalidatePath('/seasons');
    revalidatePath('/programs');
  }

  const responseHeaders = new Headers({
    'content-type': response.headers.get('content-type') ?? 'application/json',
  });
  for (const header of ['cache-control', 'content-disposition', 'x-report-row-count']) {
    const value = response.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  return new Response(response.body, { headers: responseHeaders, status: response.status });
}

export const GET = proxy;
export const PATCH = proxy;
export const POST = proxy;
export const PUT = proxy;
