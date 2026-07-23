export function validateIdentityRuntime(input: {
  cognitoClientId: string | undefined;
  cognitoRegion: string | undefined;
  cognitoUserPoolId: string | undefined;
  hasEncryptionKeyring: boolean;
  localAuthEnabled: boolean;
  nodeEnvironment: string | undefined;
  providerName: string;
}): void {
  if (input.nodeEnvironment === 'production' && input.localAuthEnabled) {
    throw new Error('LOCAL_AUTH_ENABLED cannot be used in production');
  }
  if (input.nodeEnvironment === 'production' && input.providerName === 'local') {
    throw new Error('The local identity provider cannot be used in production');
  }
  if (input.nodeEnvironment === 'production' && !input.hasEncryptionKeyring) {
    throw new Error(
      'AUTH_TOKEN_ACTIVE_KEY_VERSION and AUTH_TOKEN_ENCRYPTION_KEYS are required in production',
    );
  }
  if (
    input.providerName === 'cognito' &&
    (!input.cognitoRegion || !input.cognitoUserPoolId || !input.cognitoClientId)
  ) {
    throw new Error('COGNITO_REGION, COGNITO_USER_POOL_ID, and COGNITO_CLIENT_ID are required');
  }
}
