CREATE TABLE season_rollovers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  source_season_id uuid NOT NULL,
  target_season_id uuid NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT season_rollovers_source_fk
    FOREIGN KEY (organization_id, source_season_id)
    REFERENCES seasons (organization_id, id),
  CONSTRAINT season_rollovers_target_fk
    FOREIGN KEY (organization_id, target_season_id)
    REFERENCES seasons (organization_id, id),
  CONSTRAINT season_rollovers_distinct_seasons
    CHECK (source_season_id <> target_season_id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, target_season_id)
);

CREATE TABLE season_rollover_sessions (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  season_rollover_id uuid NOT NULL,
  source_session_id uuid NOT NULL,
  target_session_id uuid NOT NULL,
  CONSTRAINT season_rollover_sessions_rollover_fk
    FOREIGN KEY (organization_id, season_rollover_id)
    REFERENCES season_rollovers (organization_id, id),
  CONSTRAINT season_rollover_sessions_source_fk
    FOREIGN KEY (organization_id, source_session_id)
    REFERENCES sessions (organization_id, id),
  CONSTRAINT season_rollover_sessions_target_fk
    FOREIGN KEY (organization_id, target_session_id)
    REFERENCES sessions (organization_id, id),
  PRIMARY KEY (organization_id, season_rollover_id, source_session_id),
  UNIQUE (organization_id, target_session_id)
);

CREATE INDEX season_rollover_sessions_source_idx
  ON season_rollover_sessions (organization_id, source_session_id, target_session_id);

ALTER TABLE season_rollovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_rollovers FORCE ROW LEVEL SECURITY;
ALTER TABLE season_rollover_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_rollover_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY season_rollovers_tenant_all ON season_rollovers
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY season_rollover_sessions_tenant_all ON season_rollover_sessions
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON season_rollovers, season_rollover_sessions FROM camp_app;
GRANT SELECT, INSERT ON season_rollovers TO camp_app;
GRANT SELECT, INSERT ON season_rollover_sessions TO camp_app;
