import { randomUUID } from 'node:crypto';

import { createDatabaseClient, IdentityStore } from '@camp-registration/database';

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.BOOTSTRAP_SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
const providerSubject = process.env.BOOTSTRAP_SYSTEM_ADMIN_SUBJECT?.trim();
const provider = process.env.IDENTITY_PROVIDER?.trim().toLowerCase() ?? 'cognito';
const issuer =
  process.env.COGNITO_ISSUER ??
  (process.env.COGNITO_REGION && process.env.COGNITO_USER_POOL_ID
    ? `https://cognito-idp.${process.env.COGNITO_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
    : 'camp-registration-local');

if (!databaseUrl || !email || !providerSubject) {
  throw new Error(
    'DATABASE_URL, BOOTSTRAP_SYSTEM_ADMIN_EMAIL, and BOOTSTRAP_SYSTEM_ADMIN_SUBJECT are required',
  );
}

const database = createDatabaseClient({ connectionString: databaseUrl });
try {
  await new IdentityStore(database).bootstrapSystemAdmin({
    accountId: randomUUID(),
    email,
    externalIdentityId: randomUUID(),
    issuer,
    provider,
    providerSubject,
  });
  process.stdout.write(`Bootstrapped system administrator ${email}\n`);
} finally {
  await database.close();
}
