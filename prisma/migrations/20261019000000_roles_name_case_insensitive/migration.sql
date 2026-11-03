-- Role names are unique per shop ignoring case: "Manager" and "manager" are the
-- same name. roles_name_unique (tenant_id, name) stays; it only sees exact
-- spelling, so this index is what actually refuses a case variant. The Owner
-- role is covered too, so nobody can add a role called "owner".

DO $$
DECLARE
    v_clashes text;
BEGIN
    SELECT string_agg(format('%s: %s', tenant_id, names), E'\n')
    INTO v_clashes
    FROM (
        SELECT tenant_id, string_agg(name, ' / ' ORDER BY name) AS names
        FROM roles
        GROUP BY tenant_id, lower(name)
        HAVING count(*) > 1
    ) clashes;

    IF v_clashes IS NOT NULL THEN
        RAISE EXCEPTION E'Rename these roles first - same name ignoring case (tenant: names):\n%', v_clashes;
    END IF;
END $$;

CREATE UNIQUE INDEX idx_roles_tenant_lower_name ON roles (tenant_id, lower(name));
