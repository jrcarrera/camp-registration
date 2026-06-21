import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('system routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  it('reports liveness', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'camp-registration-api',
      status: 'ok',
      version: '0.0.0',
    });
  });

  it('reports readiness without optional local dependencies', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      database: 'not_configured',
      service: 'camp-registration-api',
      status: 'ready',
    });
  });
});
