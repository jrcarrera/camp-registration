import { platformRoles, type PlatformRole, type RequestIdentity } from '@camp-registration/auth';
import { createDatabaseClient, IdentityStore } from '@camp-registration/database';

import { buildApp, type BuildAppOptions } from './app.js';
import { LocalPaymentProvider, type PaymentProvider } from './payments/provider.js';
import { StripePaymentProvider } from './payments/stripe-provider.js';
import { AesGcmHealthEncryptionProvider } from './health-records/encryption.js';
import { CognitoIdentityProvider } from './identity/cognito-provider.js';
import { validateIdentityRuntime } from './identity/config.js';
import { AuthStateCipher } from './identity/encryption.js';
import { LocalIdentityProvider } from './identity/local-provider.js';
import type { IdentityProvider } from './identity/provider.js';
import { IdentityService } from './identity/service.js';

const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);
const host = process.env.API_HOST ?? '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl }) : undefined;
const localAuthEnabled = process.env.LOCAL_AUTH_ENABLED === 'true';
const organizationId = process.env.LOCAL_ORGANIZATION_ID;
const actorId = process.env.LOCAL_ACTOR_ID ?? 'local-camp-admin';
const defaultRoles = rolesFrom(process.env.LOCAL_ROLES ?? 'organization_admin');
const publicAppBaseUrl = process.env.PUBLIC_APP_BASE_URL ?? 'http://localhost:3000';
const identityProviderName = process.env.IDENTITY_PROVIDER?.trim().toLowerCase() ?? 'local';

validateIdentityRuntime({
  cognitoClientId: process.env.COGNITO_CLIENT_ID,
  cognitoRegion: process.env.COGNITO_REGION,
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
  hasEncryptionKeyring: Boolean(process.env.AUTH_TOKEN_ENCRYPTION_KEYS),
  localAuthEnabled,
  nodeEnvironment: process.env.NODE_ENV,
  providerName: identityProviderName,
});

function identityProviderFromEnvironment(): IdentityProvider {
  if (identityProviderName === 'local') {
    return new LocalIdentityProvider(process.env.NODE_ENV !== 'production');
  }
  if (identityProviderName === 'cognito') {
    const region = process.env.COGNITO_REGION;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;
    if (!region || !userPoolId || !clientId) throw new Error('Cognito configuration is required');
    return new CognitoIdentityProvider(clientId, userPoolId, region);
  }
  throw new Error(`Unsupported IDENTITY_PROVIDER: ${identityProviderName}`);
}

function paymentProviderFromEnvironment(): PaymentProvider | undefined {
  const provider = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (!provider || provider === 'disabled') return undefined;
  if (provider === 'local') return new LocalPaymentProvider(publicAppBaseUrl);
  if (provider === 'stripe') {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey || !webhookSecret) {
      throw new Error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required for Stripe');
    }
    return new StripePaymentProvider(secretKey, webhookSecret, publicAppBaseUrl);
  }
  throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rolesFrom(value: string): PlatformRole[] {
  const roles = value
    .split(',')
    .map((role) => role.trim())
    .filter((role): role is PlatformRole => platformRoles.includes(role as PlatformRole));
  return roles.length > 0 ? roles : ['organization_admin'];
}

const localRequestContext: BuildAppOptions['requestContext'] | undefined =
  localAuthEnabled && organizationId
    ? (request) => {
        const activeOrganizationId =
          headerValue(request.headers['x-local-organization-id']) ?? organizationId;
        const identity: RequestIdentity = {
          email: headerValue(request.headers['x-local-email']) ?? 'admin@local.camp.test',
          emailVerified: headerValue(request.headers['x-local-email-verified']) !== 'false',
          memberships: [
            {
              campIds: [],
              organizationId: activeOrganizationId,
              roles: rolesFrom(
                headerValue(request.headers['x-local-roles']) ?? defaultRoles.join(','),
              ),
            },
          ],
          mfaVerified: headerValue(request.headers['x-local-mfa-verified']) !== 'false',
          subject: headerValue(request.headers['x-local-actor-id']) ?? actorId,
        };
        return { identity, organizationId: activeOrganizationId };
      }
    : undefined;
const paymentProvider = paymentProviderFromEnvironment();
const healthEncryptionProvider = database
  ? AesGcmHealthEncryptionProvider.fromEnvironment()
  : undefined;
const identityProvider = database ? identityProviderFromEnvironment() : undefined;
const authStateCipher = database
  ? process.env.AUTH_TOKEN_ENCRYPTION_KEYS
    ? AuthStateCipher.fromEnvironment()
    : process.env.NODE_ENV === 'production'
      ? (() => {
          throw new Error(
            'AUTH_TOKEN_ACTIVE_KEY_VERSION and AUTH_TOKEN_ENCRYPTION_KEYS are required in production',
          );
        })()
      : AuthStateCipher.forDevelopment()
  : undefined;
const identityService =
  database && identityProvider && authStateCipher
    ? new IdentityService(
        new IdentityStore(database),
        identityProvider,
        authStateCipher,
        publicAppBaseUrl,
      )
    : undefined;

const appOptions: BuildAppOptions = {
  logger: true,
  ...(database ? { database } : {}),
  ...(localRequestContext ? { requestContext: localRequestContext } : {}),
  ...(paymentProvider ? { paymentProvider } : {}),
  ...(healthEncryptionProvider ? { healthEncryptionProvider } : {}),
  ...(identityService ? { identityService } : {}),
};
const app = await buildApp(appOptions);

if (database) {
  app.addHook('onClose', async () => {
    await database.close();
  });
}

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
