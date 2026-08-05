CREATE FUNCTION get_public_catalog_preview(requested_organization_id uuid, requested_slug text)
RETURNS TABLE (
  organization_slug text, organization_name text, public_tagline text, public_description text,
  brand_primary_color text, brand_logo_url text, public_website_url text, public_contact_email text,
  self_service_signup_enabled boolean, season_name text, season_year integer, program_id uuid,
  program_name text, delivery_mode text, program_description text, session_id uuid, session_name text,
  starts_on date, ends_on date, registration_opens_at timestamptz, registration_closes_at timestamptz,
  minimum_age integer, maximum_age integer, minimum_grade integer, maximum_grade integer,
  currency text, price_cents integer, deposit_cents integer, registration_state text, availability text
)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH selected_org AS (
    SELECT o.* FROM public.organizations o
    WHERE o.id = requested_organization_id AND o.slug = requested_slug
  ), preview_sessions AS (
    SELECT s.*, o.slug, o.name AS organization_name, o.public_tagline, o.public_description,
      o.brand_primary_color, o.brand_logo_url, o.public_website_url, o.public_contact_email,
      o.self_service_signup_enabled, se.name AS season_name, se.year AS season_year,
      p.name AS program_name, p.delivery_mode, p.description AS program_description,
      p.default_minimum_grade AS minimum_grade, p.default_maximum_grade AS maximum_grade
    FROM selected_org o
    LEFT JOIN public.sessions s ON s.organization_id = o.id AND s.status = 'PUBLISHED'
    LEFT JOIN public.seasons se ON se.organization_id = s.organization_id AND se.id = s.season_id
    LEFT JOIN public.programs p ON p.organization_id = s.organization_id AND p.id = s.program_id
  )
  SELECT ps.slug, ps.organization_name, ps.public_tagline, ps.public_description,
    ps.brand_primary_color, ps.brand_logo_url, ps.public_website_url, ps.public_contact_email,
    ps.self_service_signup_enabled, ps.season_name, ps.season_year, ps.program_id, ps.program_name,
    ps.delivery_mode, ps.program_description, ps.id, ps.name, ps.starts_on, ps.ends_on,
    ps.registration_opens_at, ps.registration_closes_at, ps.minimum_age, ps.maximum_age,
    ps.minimum_grade, ps.maximum_grade, ps.currency, ps.price_cents, ps.deposit_cents,
    CASE WHEN transaction_timestamp() < ps.registration_opens_at THEN 'NOT_YET_OPEN'
         WHEN transaction_timestamp() >= ps.registration_closes_at THEN 'CLOSED' ELSE 'OPEN' END,
    CASE WHEN GREATEST(ps.capacity - COALESCE(reserved.confirmed, 0) - COALESCE(reserved.holds, 0), 0) > 5 THEN 'OPEN'
         WHEN GREATEST(ps.capacity - COALESCE(reserved.confirmed, 0) - COALESCE(reserved.holds, 0), 0) > 0 THEN 'LIMITED'
         WHEN ps.waitlist_enabled THEN 'WAITLIST' ELSE 'FULL' END
  FROM preview_sessions ps
  LEFT JOIN LATERAL (
    SELECT
      (SELECT count(*)::integer FROM public.registrations r WHERE r.organization_id = ps.organization_id AND r.session_id = ps.id AND r.status = 'CONFIRMED') AS confirmed,
      ((SELECT count(*)::integer FROM public.waitlist_offers wo WHERE wo.organization_id = ps.organization_id AND wo.session_id = ps.id AND wo.status = 'PENDING' AND wo.expires_at > transaction_timestamp())
       + (SELECT count(*)::integer FROM public.capacity_holds ch WHERE ch.organization_id = ps.organization_id AND ch.session_id = ps.id AND ch.status IN ('ACTIVE', 'EXPIRING') AND ch.expires_at > transaction_timestamp())) AS holds
  ) reserved ON ps.id IS NOT NULL
  ORDER BY ps.season_year DESC, ps.season_name, ps.program_name, ps.starts_on, ps.id
$$;

REVOKE ALL ON FUNCTION get_public_catalog_preview(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_catalog_preview(uuid, text) TO camp_app;

COMMENT ON FUNCTION get_public_catalog_preview(uuid, text) IS 'Tenant-RLS-bound authenticated preview of a disabled public catalog.';
