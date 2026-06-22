import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const apiBaseUrl = process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3001';
  const target = new URL(path.join('/'), `${apiBaseUrl.replace(/\/$/, '')}/`);
  target.search = request.nextUrl.search;

  const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text();
  const response = await fetch(target, {
    ...(body === null ? {} : { body }),
    headers: {
      accept: request.headers.get('accept') ?? 'application/json',
      'content-type': request.headers.get('content-type') ?? 'application/json',
      'x-request-id': request.headers.get('x-request-id') ?? crypto.randomUUID(),
    },
    method: request.method,
  });

  if (response.ok && request.method !== 'GET' && request.method !== 'HEAD') {
    revalidatePath('/');
    revalidatePath('/sessions');
    revalidatePath('/programs');
  }

  return new Response(response.body, {
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    status: response.status,
  });
}

export const GET = proxy;
export const PATCH = proxy;
export const POST = proxy;
