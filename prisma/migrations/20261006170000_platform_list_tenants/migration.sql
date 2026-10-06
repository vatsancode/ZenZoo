-- The platform-admin tenants list needs each tenant's owner email, but
-- tenant_memberships and users both carry RLS policies scoped to "the
-- current tenant context" - and the platform admin, by definition, has no
-- single tenant selected while listing *all* tenants. An ordinary query
-- (even run as app_role) would silently see zero membership rows, the
-- same RLS gotcha already documented for check_tenant_has_active_owner()
-- (see that function's migration). The fix is the same one used there and
-- for provision_new_account(): one narrow SECURITY DEFINER function,
-- owned by whoever owns the tables (bypassing RLS only for this one,
-- specific, read-only, already-platform-admin-gated purpose), rather than
-- weakening app_role's own grants or the policies themselves.
--
-- Who may call this at all is still an application-layer decision: it is
-- reached only through server/api's own platform-admin check
-- (requirePlatformAdmin, HTTP Basic Auth or session cookie against
-- platform_admins), the same gate provision_new_account() relies on.
CREATE FUNCTION platform_list_tenants(p_search VARCHAR DEFAULT NULL)
RETURNS TABLE (
    id          UUID,
    name        VARCHAR(200),
    slug        VARCHAR(100),
    status      VARCHAR(20),
    created_at  TIMESTAMPTZ,
    owner_email VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.slug,
        t.status,
        t.created_at,
        u.email
    FROM tenants t
    LEFT JOIN tenant_memberships tm ON tm.tenant_id = t.id AND tm.role = 'owner'
    LEFT JOIN users u ON u.id = tm.user_id
    WHERE p_search IS NULL
       OR t.name ILIKE '%' || p_search || '%'
       OR t.slug ILIKE '%' || p_search || '%'
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION platform_list_tenants(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_list_tenants(VARCHAR) TO app_role;
