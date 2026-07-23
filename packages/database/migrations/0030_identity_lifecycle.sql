ALTER TABLE organizations
  ADD COLUMN self_service_signup_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE user_accounts (
  id text PRIMARY KEY,
  primary_email text NOT NULL,
  email_normalized text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  platform_role text NULL CHECK (platform_role IS NULL OR platform_role = 'system_admin'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (email_normalized)
);

CREATE TABLE external_identities (
  id uuid PRIMARY KEY,
  account_id text NOT NULL REFERENCES user_accounts (id),
  provider text NOT NULL,
  issuer text NOT NULL,
  provider_subject text NOT NULL,
  email_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (provider, issuer, provider_subject)
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  account_id text NOT NULL REFERENCES user_accounts (id),
  roles text[] NOT NULL CHECK (
    cardinality(roles) > 0
    AND roles <@ ARRAY[
      'camp_staff', 'health_staff', 'camp_admin', 'organization_admin'
    ]::text[]
  ),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, account_id),
  UNIQUE (organization_id, id)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  account_id text NOT NULL REFERENCES user_accounts (id),
  active_organization_id uuid NULL REFERENCES organizations (id),
  authentication_method text NOT NULL CHECK (
    authentication_method IN ('EMAIL_OTP', 'PASSWORD_TOTP', 'LOCAL')
  ),
  mfa_verified boolean NOT NULL DEFAULT false,
  requires_mfa_setup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  revoked_reason text NULL
);

CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  email_normalized text NOT NULL,
  organization_id uuid NULL REFERENCES organizations (id),
  intent text NOT NULL CHECK (
    intent IN ('SIGN_IN', 'JOIN_ORGANIZATION', 'ACCEPT_INVITATION', 'RECOVER_PASSWORD')
  ),
  next_step text NOT NULL CHECK (
    next_step IN (
      'EMAIL_OTP', 'RECOVERY_CODE', 'PASSWORD', 'TOTP', 'SET_PASSWORD',
      'ENROLL_TOTP', 'AUTHENTICATED'
    )
  ),
  provider_state text NULL,
  invitation_token_hash text NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE identity_invitations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  invitation_type text NOT NULL CHECK (invitation_type IN ('FAMILY_ADULT', 'WORKFORCE')),
  family_id uuid NULL,
  adult_id uuid NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  roles text[] NOT NULL DEFAULT '{}'::text[] CHECK (
    roles <@ ARRAY[
      'camp_staff', 'health_staff', 'camp_admin', 'organization_admin'
    ]::text[]
  ),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')
  ),
  invited_by text NOT NULL,
  accepted_by text NULL REFERENCES user_accounts (id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT identity_invitations_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  CONSTRAINT identity_invitations_adult_fk
    FOREIGN KEY (organization_id, adult_id) REFERENCES adults (organization_id, id),
  CONSTRAINT identity_invitations_shape CHECK (
    (
      invitation_type = 'FAMILY_ADULT'
      AND family_id IS NOT NULL
      AND adult_id IS NOT NULL
      AND cardinality(roles) = 0
    )
    OR (
      invitation_type = 'WORKFORCE'
      AND family_id IS NULL
      AND adult_id IS NULL
      AND cardinality(roles) > 0
    )
  ),
  UNIQUE (organization_id, id)
);

CREATE TABLE family_onboarding_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  account_id text NOT NULL REFERENCES user_accounts (id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED')
  ),
  resolution text NULL CHECK (
    resolution IS NULL OR resolution IN ('NEW_FAMILY', 'MATCHED_ADULT')
  ),
  family_id uuid NULL,
  adult_id uuid NULL,
  decision_reason text NULL,
  resolved_by text NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT family_onboarding_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  CONSTRAINT family_onboarding_adult_fk
    FOREIGN KEY (organization_id, adult_id) REFERENCES adults (organization_id, id),
  UNIQUE (organization_id, account_id),
  UNIQUE (organization_id, id)
);

CREATE TABLE identity_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NULL REFERENCES organizations (id),
  actor_account_id text NULL,
  action text NOT NULL,
  target_account_id text NULL,
  outcome text NOT NULL,
  request_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE INDEX external_identities_account_idx
  ON external_identities (account_id, provider, id);
CREATE INDEX organization_memberships_account_idx
  ON organization_memberships (account_id, status, organization_id);
CREATE INDEX auth_sessions_account_idx
  ON auth_sessions (account_id, revoked_at, absolute_expires_at);
CREATE INDEX auth_challenges_email_idx
  ON auth_challenges (email_normalized, expires_at DESC);
CREATE INDEX identity_invitations_pending_idx
  ON identity_invitations (organization_id, status, expires_at, id);
CREATE INDEX family_onboarding_status_idx
  ON family_onboarding_requests (organization_id, status, created_at, id);
CREATE INDEX identity_audit_events_time_idx
  ON identity_audit_events (organization_id, occurred_at DESC, id DESC);

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE identity_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE family_onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_onboarding_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_memberships_tenant_all ON organization_memberships
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY identity_invitations_tenant_all ON identity_invitations
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY family_onboarding_requests_tenant_all ON family_onboarding_requests
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

INSERT INTO user_accounts (
  id, primary_email, email_normalized, email_verified
)
SELECT
  identity_subject,
  COALESCE(
    min(email) FILTER (WHERE email IS NOT NULL),
    identity_subject || '@local.invalid'
  ),
  lower(COALESCE(
    min(email) FILTER (WHERE email IS NOT NULL),
    identity_subject || '@local.invalid'
  )),
  true
FROM adults
WHERE identity_subject IS NOT NULL
GROUP BY identity_subject
ON CONFLICT (id) DO NOTHING;

INSERT INTO external_identities (
  id, account_id, provider, issuer, provider_subject, email_snapshot
)
SELECT
  gen_random_uuid(),
  id,
  'local',
  'camp-registration-local',
  id,
  primary_email
FROM user_accounts
ON CONFLICT (provider, issuer, provider_subject) DO NOTHING;

ALTER TABLE notification_outbox
  DROP CONSTRAINT notification_outbox_notification_type_check,
  ALTER COLUMN family_id DROP NOT NULL,
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN registration_id DROP NOT NULL,
  ADD CONSTRAINT notification_outbox_notification_type_check CHECK (
    notification_type IN (
      'WAITLIST_OFFERED', 'WAITLIST_EXPIRING_SOON', 'WAITLIST_ACCEPTED',
      'WAITLIST_DECLINED', 'WAITLIST_EXPIRED', 'WAITLIST_CANCELLED',
      'PAYMENT_RECEIPT', 'ORDER_CONFIRMATION', 'INSTALLMENT_DUE_SOON', 'INSTALLMENT_DUE',
      'LIFECYCLE_MESSAGE', 'IDENTITY_MESSAGE'
    )
  );

REVOKE ALL ON
  user_accounts,
  external_identities,
  organization_memberships,
  auth_sessions,
  auth_challenges,
  identity_invitations,
  family_onboarding_requests,
  identity_audit_events
FROM camp_app;

GRANT SELECT, INSERT, UPDATE ON
  user_accounts,
  external_identities,
  organization_memberships,
  auth_sessions,
  auth_challenges,
  identity_invitations,
  family_onboarding_requests
TO camp_app;
GRANT INSERT ON identity_audit_events TO camp_app;
GRANT USAGE, SELECT ON SEQUENCE identity_audit_events_id_seq TO camp_app;

GRANT UPDATE (self_service_signup_enabled, updated_at) ON organizations TO camp_app;
GRANT INSERT (
  id, organization_id, family_id, session_id, registration_id, waitlist_offer_id,
  notification_type, recipient_email, template_data, idempotency_key
) ON notification_outbox TO camp_app;

CREATE FUNCTION get_public_organization(requested_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  self_service_signup_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    organizations.id,
    organizations.name,
    organizations.slug,
    organizations.self_service_signup_enabled
  FROM public.organizations
  WHERE organizations.slug = requested_slug
$$;

CREATE FUNCTION list_identity_organization_access(requested_account_id text)
RETURNS TABLE (
  organization_id uuid,
  name text,
  slug text,
  roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH access AS (
    SELECT
      memberships.organization_id,
      memberships.roles
    FROM public.organization_memberships memberships
    WHERE memberships.account_id = requested_account_id
      AND memberships.status = 'ACTIVE'
    UNION ALL
    SELECT
      adults.organization_id,
      ARRAY['parent_guardian']::text[]
    FROM public.adults adults
    WHERE adults.identity_subject = requested_account_id
      AND adults.archived_at IS NULL
  )
  SELECT
    organizations.id,
    organizations.name,
    organizations.slug,
    array_agg(DISTINCT role_name ORDER BY role_name)
  FROM access
  JOIN public.organizations ON organizations.id = access.organization_id
  CROSS JOIN LATERAL unnest(access.roles) role_name
  GROUP BY organizations.id, organizations.name, organizations.slug
  ORDER BY organizations.name, organizations.id
$$;

REVOKE ALL ON FUNCTION get_public_organization(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_identity_organization_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_organization(text) TO camp_app;
GRANT EXECUTE ON FUNCTION list_identity_organization_access(text) TO camp_app;
