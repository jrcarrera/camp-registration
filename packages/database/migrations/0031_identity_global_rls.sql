ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE identity_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY user_accounts_identity_service_all ON user_accounts
  FOR ALL
  USING (current_setting('app.identity_service', true) = 'true')
  WITH CHECK (current_setting('app.identity_service', true) = 'true');
CREATE POLICY external_identities_identity_service_all ON external_identities
  FOR ALL
  USING (current_setting('app.identity_service', true) = 'true')
  WITH CHECK (current_setting('app.identity_service', true) = 'true');
CREATE POLICY auth_sessions_identity_service_all ON auth_sessions
  FOR ALL
  USING (current_setting('app.identity_service', true) = 'true')
  WITH CHECK (current_setting('app.identity_service', true) = 'true');
CREATE POLICY auth_challenges_identity_service_all ON auth_challenges
  FOR ALL
  USING (current_setting('app.identity_service', true) = 'true')
  WITH CHECK (current_setting('app.identity_service', true) = 'true');
CREATE POLICY identity_audit_events_identity_service_all ON identity_audit_events
  FOR ALL
  USING (current_setting('app.identity_service', true) = 'true')
  WITH CHECK (current_setting('app.identity_service', true) = 'true');

-- Token inspection has no tenant ID until the hash resolves. Only the identity
-- store opts into this policy inside a short transaction.
CREATE POLICY identity_invitations_auth_lookup ON identity_invitations
  FOR SELECT
  USING (current_setting('app.identity_service', true) = 'true');
