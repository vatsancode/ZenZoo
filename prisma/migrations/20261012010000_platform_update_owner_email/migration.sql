-- Lets a platform admin correct a tenant's owner's email, same reasoning
-- and shape as platform_reset_tenant_owner_password(): app_role has no
-- direct UPDATE visibility into an arbitrary tenant's users row outside a
-- tenant session (tenant_membership_or_self RLS policy on users), so this
-- needs the same SECURITY DEFINER escape hatch.
CREATE FUNCTION public.platform_update_tenant_owner_email(p_tenant_id uuid, p_email character varying)
    RETURNS TABLE(user_id uuid, email character varying)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT u.id INTO v_user_id
    FROM tenant_memberships tm
    JOIN roles r ON r.id = tm.role_id AND r.tenant_id = tm.tenant_id
    JOIN users u ON u.id = tm.user_id
    WHERE tm.tenant_id = p_tenant_id
      AND r.is_owner_role
      AND tm.status = 'active';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No active owner found for tenant %', p_tenant_id;
    END IF;

    UPDATE users
    SET email = lower(p_email)
    WHERE id = v_user_id;

    RETURN QUERY SELECT u.id, u.email FROM users u WHERE u.id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_tenant_owner_email(p_tenant_id uuid, p_email character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_update_tenant_owner_email(p_tenant_id uuid, p_email character varying) TO app_role;
