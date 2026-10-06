-- Platform admin: a person who can create new tenants, acting before and
-- outside any tenant. Deliberately NOT a users/tenant_memberships row -
-- that identity space is scoped to "inside a tenant" (see users' own
-- notes), and a platform admin acts before any tenant exists at all. A
-- separate, narrow table instead, following the same "narrow, dedicated
-- mechanism" pattern provision_new_account already uses.
--
-- No RLS: this isn't tenant-owned data, and holds at most a handful of
-- rows. app_role gets SELECT only, for the login check (password
-- verification happens in application code, not SQL - a bcrypt hash
-- can't be compared with plain equality) - never INSERT/UPDATE/DELETE,
-- so a platform admin account can only ever be created or rotated by
-- someone with direct database access, never through the live app.
CREATE TABLE platform_admins (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    email           VARCHAR(255) NOT NULL UNIQUE
                        CONSTRAINT platform_admins_email_lowercase_check
                        CHECK (email = lower(email)),
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_platform_admins_set_updated_at
    BEFORE UPDATE ON platform_admins
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

GRANT SELECT ON platform_admins TO app_role;

-- users: password storage was deferred to "whichever auth provider is
-- chosen" (docs/db-design.md). Now decided as custom, admin-set passwords
-- with no self-serve signup and no reset flow, so it lives directly on
-- users instead. NOT NULL is safe to add immediately - this table has no
-- rows yet.
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL;
