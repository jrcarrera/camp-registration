import { expect, type APIRequestContext } from '@playwright/test';

const apiReadyUrl = 'http://127.0.0.1:3001/ready';

export async function waitForApiReady(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const response = await request.get(apiReadyUrl);
          return response.status();
        } catch {
          return 0;
        }
      },
      { timeout: 15_000 },
    )
    .toBe(200);
}
