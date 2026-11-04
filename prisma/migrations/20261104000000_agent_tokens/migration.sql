-- Agent tokens: the key an outside tool (the MCP server) sends to act as a ZenZoo user.
-- A token carries a person's tenant membership, so what it can read is exactly what
-- that person's role allows - there is no second set of permissions. Only a SHA-256
-- hash of the token is stored; the token itself is shown once, when it is created.
-- Setting revoked_at switches a token off. Creating and revoking tokens is built with
-- the MCP connection screen, not here.

CREATE TABLE public.agent_tokens (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    token_prefix character varying(12) NOT NULL,
    token_hash character varying(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT agent_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT agent_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
    CONSTRAINT agent_tokens_membership_fk FOREIGN KEY (tenant_id, membership_id) REFERENCES public.tenant_memberships(tenant_id, id),
    CONSTRAINT agent_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX idx_agent_tokens_tenant_id ON public.agent_tokens USING btree (tenant_id);
CREATE INDEX idx_agent_tokens_membership_id ON public.agent_tokens USING btree (membership_id);

ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.agent_tokens USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));

-- No DELETE: a token is switched off with revoked_at, so there is a record of it.
REVOKE ALL ON TABLE public.agent_tokens FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_tokens TO app_role;

-- Finds who a token belongs to. The caller only has the token, not yet a tenant, so row-level
-- security would hide every row; like find_login_credentials this runs as the table owner.
-- Returns nothing for an unknown or revoked token, or when the membership or user is no
-- longer active.
CREATE FUNCTION public.find_agent_actor(p_token_hash character varying) RETURNS TABLE(user_id uuid, tenant_id uuid, token_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    SELECT tm.user_id, at.tenant_id, at.id
      FROM agent_tokens at
      JOIN tenant_memberships tm ON tm.tenant_id = at.tenant_id AND tm.id = at.membership_id
      JOIN users u ON u.id = tm.user_id
     WHERE at.token_hash = p_token_hash
       AND at.revoked_at IS NULL
       AND tm.status = 'active'
       AND u.status = 'active'
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_agent_actor(p_token_hash character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.find_agent_actor(p_token_hash character varying) TO app_role;
