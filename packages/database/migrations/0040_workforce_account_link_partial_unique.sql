-- Preserve the original 0039 migration for environments that have already
-- applied it, while aligning account-link uniqueness with the Workforce v1
-- contract: only non-null optional account links participate in the index.
ALTER TABLE workforce_profiles
  DROP CONSTRAINT workforce_profiles_organization_id_account_id_key;

CREATE UNIQUE INDEX workforce_profiles_account_link_unique_idx
  ON workforce_profiles (organization_id, account_id)
  WHERE account_id IS NOT NULL;

-- Session changes are a supported optimistic assignment update; retain the
-- otherwise narrow, no-delete runtime grant.
GRANT UPDATE (session_id) ON workforce_session_assignments TO camp_app;
