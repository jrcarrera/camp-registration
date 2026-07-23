export const platformRoles = [
  'parent_guardian',
  'camp_staff',
  'health_staff',
  'camp_admin',
  'organization_admin',
  'system_admin',
] as const;

export type PlatformRole = (typeof platformRoles)[number];

export interface AuthenticatedIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
}

export interface ScopedMembership {
  organizationId: string;
  roles: readonly PlatformRole[];
  campIds: readonly string[];
}

export interface RequestIdentity extends AuthenticatedIdentity {
  memberships: readonly ScopedMembership[];
  mfaVerified: boolean;
}
