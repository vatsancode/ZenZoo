-- The second "insert a user" door - see provision_new_account() in
-- "Bootstrapping" for the first one (a brand-new tenant's own owner, a
-- genuine cold-start with no session yet). This one is for the ordinary
-- case: a tenant that already exists, with someone already signed into it
-- (an owner or anyone with "users:edit"), adding ANOTHER person directly -
-- they pick that person's password themselves and share it outside the
-- app; there is no invite-by-email step.
--
-- Still needs the exact same escape hatch, for the exact same reason:
-- app_role has no INSERT grant on `users` at all (see "The application-role
-- privilege model") - that restriction has nothing to do with RLS or which
-- tenant is in session, it's a table-privilege lock that applies
-- regardless. Only a SECURITY DEFINER function, owned by app_owner, can get
-- past it - this one is deliberately as narrow as provision_new_account:
-- it takes no caller-supplied access to any EXISTING person, only enough to
-- create exactly one new one and attach them to the one tenant/role the
-- caller already named. tenant_memberships_role_fk (see "roles") already
-- rejects a role_id that doesn't actually belong to p_tenant_id, closing
-- the one real "could this be redirected?" gap this function would
-- otherwise have.
--
-- Who may call this at all - i.e. does the actor actually hold
-- "users:edit" for p_tenant_id - is an application-layer decision, checked
-- by the capability calling this (server/api/src/capabilities/actions/
-- createUser.ts) before this function is ever reached, same division of
-- responsibility provision_new_account's own note describes.
CREATE FUNCTION add_tenant_user(
    p_tenant_id     UUID,
    p_role_id       UUID,
    p_email         VARCHAR(255),
    p_password_hash VARCHAR(255),
    p_first_name    VARCHAR(100),
    p_last_name     VARCHAR(100)
) RETURNS TABLE (user_id UUID, membership_id UUID) AS $$
DECLARE
    v_user_id       UUID;
    v_membership_id UUID;
BEGIN
    INSERT INTO users (email, password_hash, first_name, last_name)
    VALUES (lower(p_email), p_password_hash, p_first_name, p_last_name)
    RETURNING id INTO v_user_id;

    INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
    VALUES (p_tenant_id, v_user_id, p_role_id, 'active')
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_user_id, v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION add_tenant_user(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_tenant_user(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO app_role;
