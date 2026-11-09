-- OAuth sign-in for agents (Claude's "Add custom connector"). A person approves once on a ZenZoo
-- page; Claude is then handed a short-lived access token plus a refresh token that renews it.
-- Access and refresh tokens live in agent_tokens, as before (only their SHA-256 hash is stored).
-- One approval is one row in agent_connections, so "Disconnect" switches off every token that
-- approval produced. Tokens made by hand with createAgentToken.ts keep working unchanged
-- (kind = 'access', no expiry, no connection).

-- The apps that asked to connect (registered on the fly by the client; see POST /oauth/register).
-- Not tenant data: a client registers before anyone has signed in, so there is no tenant yet.
CREATE TABLE public.oauth_clients (
    id uuid DEFAULT uuidv7() NOT NULL,
    name character varying(100) NOT NULL,
    redirect_uris text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_clients_pkey PRIMARY KEY (id),
    CONSTRAINT oauth_clients_redirect_uris_count CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10)
);

REVOKE ALL ON TABLE public.oauth_clients FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.oauth_clients TO app_role;

-- One approval = one connection, per shop, so it is isolated like every other tenant table.
CREATE TABLE public.agent_connections (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT agent_connections_pkey PRIMARY KEY (id),
    CONSTRAINT agent_connections_tenant_id_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT agent_connections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
    CONSTRAINT agent_connections_membership_fk FOREIGN KEY (tenant_id, membership_id) REFERENCES public.tenant_memberships(tenant_id, id),
    CONSTRAINT agent_connections_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_clients(id)
);

CREATE INDEX idx_agent_connections_tenant_id ON public.agent_connections USING btree (tenant_id);
CREATE INDEX idx_agent_connections_membership_id ON public.agent_connections USING btree (membership_id);

ALTER TABLE public.agent_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.agent_connections USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));

-- No DELETE: a connection is switched off with revoked_at, so there is a record of it.
REVOKE ALL ON TABLE public.agent_connections FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_connections TO app_role;

-- The one-time codes handed to Claude between "Allow" and the token exchange. Valid for 60
-- seconds and usable once. Not row-level-secured: the token endpoint finds a code before it knows
-- the tenant. A code is 256 random bits and only its hash is stored.
CREATE TABLE public.oauth_codes (
    id uuid DEFAULT uuidv7() NOT NULL,
    code_hash character varying(64) NOT NULL,
    client_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    user_id uuid NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_codes_pkey PRIMARY KEY (id),
    CONSTRAINT oauth_codes_code_hash_unique UNIQUE (code_hash),
    CONSTRAINT oauth_codes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_clients(id),
    CONSTRAINT oauth_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
    CONSTRAINT oauth_codes_membership_fk FOREIGN KEY (tenant_id, membership_id) REFERENCES public.tenant_memberships(tenant_id, id)
);

CREATE INDEX idx_oauth_codes_expires_at ON public.oauth_codes USING btree (expires_at);

-- DELETE is allowed here only so old, used or expired codes can be swept away.
REVOKE ALL ON TABLE public.oauth_codes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_codes TO app_role;

-- Access tokens expire; refresh tokens renew them and are swapped for a new one on every use
-- (replaced_at marks a spent one, so a replayed refresh token is recognised and the connection
-- is shut down).
ALTER TABLE public.agent_tokens
    ADD COLUMN kind character varying(10) DEFAULT 'access' NOT NULL,
    ADD COLUMN expires_at timestamp with time zone,
    ADD COLUMN connection_id uuid,
    ADD COLUMN replaced_at timestamp with time zone,
    ADD CONSTRAINT agent_tokens_kind_check CHECK (kind IN ('access', 'refresh')),
    ADD CONSTRAINT agent_tokens_connection_fk FOREIGN KEY (tenant_id, connection_id) REFERENCES public.agent_connections(tenant_id, id);

CREATE INDEX idx_agent_tokens_connection_id ON public.agent_tokens USING btree (connection_id);

-- Same lookup as before, now also refusing a refresh token, an expired token, and a token whose
-- connection was disconnected. Hand-made tokens (no connection, no expiry) behave as they did.
CREATE OR REPLACE FUNCTION public.find_agent_actor(p_token_hash character varying) RETURNS TABLE(user_id uuid, tenant_id uuid, token_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    SELECT tm.user_id, at.tenant_id, at.id
      FROM agent_tokens at
      JOIN tenant_memberships tm ON tm.tenant_id = at.tenant_id AND tm.id = at.membership_id
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN agent_connections ac ON ac.tenant_id = at.tenant_id AND ac.id = at.connection_id
     WHERE at.token_hash = p_token_hash
       AND at.kind = 'access'
       AND at.revoked_at IS NULL
       AND (at.expires_at IS NULL OR at.expires_at > now())
       AND (at.connection_id IS NULL OR ac.revoked_at IS NULL)
       AND tm.status = 'active'
       AND u.status = 'active'
     LIMIT 1;
$$;

-- Finds a refresh token before the tenant is known. Unlike find_agent_actor it also returns spent
-- and switched-off tokens, so the caller can tell "replayed" from "unknown" and shut the connection
-- down. "usable" is false when the person, their membership or the connection is no longer active.
CREATE FUNCTION public.find_agent_refresh(p_token_hash character varying) RETURNS TABLE(token_id uuid, tenant_id uuid, user_id uuid, membership_id uuid, connection_id uuid, client_id uuid, expires_at timestamp with time zone, revoked_at timestamp with time zone, replaced_at timestamp with time zone, usable boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    SELECT at.id, at.tenant_id, tm.user_id, at.membership_id, at.connection_id, ac.client_id,
           at.expires_at, at.revoked_at, at.replaced_at,
           (tm.status = 'active' AND u.status = 'active' AND ac.revoked_at IS NULL)
      FROM agent_tokens at
      JOIN agent_connections ac ON ac.tenant_id = at.tenant_id AND ac.id = at.connection_id
      JOIN tenant_memberships tm ON tm.tenant_id = at.tenant_id AND tm.id = at.membership_id
      JOIN users u ON u.id = tm.user_id
     WHERE at.token_hash = p_token_hash
       AND at.kind = 'refresh'
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_agent_refresh(p_token_hash character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.find_agent_refresh(p_token_hash character varying) TO app_role;
