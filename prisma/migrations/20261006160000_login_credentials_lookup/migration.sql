-- Real bug found wiring up POST /auth/sign-in: logging in as a regular
-- tenant user is the same "cold start" case docs/db-design.md's
-- "Bootstrapping" section already describes for provision_new_account,
-- but for READS instead of a write. Before login succeeds, the app_role
-- connection has no app.current_user_id/app.current_tenant_id set - so
-- the tenant_membership_or_self policy on `users` and the tenant_isolation
-- policy on `tenant_memberships` both filter to zero rows, for the same
-- reason check_tenant_has_active_owner() originally did. A plain
-- `SELECT ... FROM users WHERE email = ...` as app_role therefore always
-- returns nothing, regardless of whether the email/password is correct.
--
-- Fix is the same shape as that earlier one, not a new mechanism: one
-- narrowly-scoped SECURITY DEFINER function that returns only what a
-- login check needs (the password hash to verify, plus the tenant/role
-- of one active membership, if any) for a single email - never a general
-- bypass of either policy.
CREATE FUNCTION find_login_credentials(p_email VARCHAR(255))
RETURNS TABLE (user_id UUID, password_hash VARCHAR(255), tenant_id UUID, role VARCHAR(20))
    SET search_path = pg_catalog, public
    SECURITY DEFINER
    LANGUAGE sql STABLE
AS $$
    SELECT u.id, u.password_hash, tm.tenant_id, tm.role
      FROM users u
      LEFT JOIN tenant_memberships tm
             ON tm.user_id = u.id AND tm.status = 'active'
     WHERE u.email = p_email
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION find_login_credentials(VARCHAR) TO app_role;
