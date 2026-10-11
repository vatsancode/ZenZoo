-- Squashed baseline migration, replacing the 15 incremental migrations that
-- previously made up this history (20261003000000_init through
-- 20261009030000_supplier_map_url). Those migrations accumulated during
-- early development, with no production data to preserve, and one of them
-- (20261007000000_custom_roles_per_tenant) left platform_list_tenants() -
-- created two migrations earlier - referencing a `tenant_memberships.role`
-- column that migration had already dropped in favor of `role_id`. That bug
-- is fixed below, not reproduced.
--
-- This file is a schema-only `pg_dump` of a database that had all 15 prior
-- migrations applied, then the platform_list_tenants() fix applied by hand.
-- `docs/db-design.md` remains the actual source of truth per
-- `prisma/README.md` - this is a mechanical snapshot of that document's
-- intent, not a hand-authored change.
--
-- Once this project has real production data, go back to one migration per
-- schema change rather than squashing - this approach only works safely
-- before there's data a `migrate reset` would destroy.

CREATE ROLE app_owner NOLOGIN;
CREATE ROLE app_role LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;

--
-- PostgreSQL database dump
--

\restrict lrROXkXEJd1dncRNEFwDpA7C3Cf422Sf1QeaE4fJpeCpSJiY4LJS3sRESH8r7aS

-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: add_tenant_user(uuid, uuid, character varying, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_tenant_user(p_tenant_id uuid, p_role_id uuid, p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying) RETURNS TABLE(user_id uuid, membership_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;


--
-- Name: app_current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
    SELECT current_setting('app.current_tenant_id', true)::UUID;
$$;


--
-- Name: app_current_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
    SELECT current_setting('app.current_user_id', true)::UUID;
$$;


--
-- Name: check_purchase_return_movements(uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_purchase_return_movements(p_return_id uuid, p_expected_movement_type character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_missing INTEGER;
BEGIN
    SELECT count(*) INTO v_missing
      FROM purchase_return_items pri
     WHERE pri.purchase_return_id = p_return_id
       AND NOT EXISTS (
           SELECT 1 FROM stock_movements sm
            WHERE sm.batch_id = pri.batch_id
              AND sm.movement_type = p_expected_movement_type
              AND sm.reference_type = 'PURCHASE_RETURN'
              AND sm.reference_id = pri.id
              AND sm.quantity = pri.quantity
       );

    IF v_missing > 0 THEN
        RAISE EXCEPTION 'purchase_return % is missing % stock movement(s) of type % for its items',
            p_return_id, v_missing, p_expected_movement_type;
    END IF;
END;
$$;


--
-- Name: check_purchase_totals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_purchase_totals(p_purchase_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    p       purchases%ROWTYPE;
    v_sub   NUMERIC;
    v_disc  NUMERIC;
    v_tax   NUMERIC;
BEGIN
    SELECT * INTO p FROM purchases WHERE id = p_purchase_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(round(quantity * unit_cost, 2)), 0),
           COALESCE(SUM(discount_amount), 0),
           COALESCE(SUM(tax_amount), 0)
      INTO v_sub, v_disc, v_tax
      FROM purchase_items
     WHERE purchase_id = p_purchase_id;

    IF p.subtotal_amount <> v_sub OR p.discount_amount <> v_disc OR p.tax_amount <> v_tax THEN
        RAISE EXCEPTION 'purchase % header totals do not match its line items', p_purchase_id;
    END IF;
END;
$$;


--
-- Name: check_sale_item_batch_movements(uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_sale_item_batch_movements(p_sale_id uuid, p_expected_movement_type character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_missing INTEGER;
BEGIN
    SELECT count(*) INTO v_missing
      FROM sale_item_batches sib
      JOIN sale_items si ON si.id = sib.sale_item_id
     WHERE si.sale_id = p_sale_id
       AND NOT EXISTS (
           SELECT 1 FROM stock_movements sm
            WHERE sm.batch_id = sib.batch_id
              AND sm.movement_type = p_expected_movement_type
              AND sm.reference_type = 'SALE_ITEM'
              AND sm.reference_id = sib.sale_item_id
              AND sm.quantity = sib.quantity
       );

    IF v_missing > 0 THEN
        RAISE EXCEPTION 'sale % is missing % stock movement(s) of type % for its batch allocations',
            p_sale_id, v_missing, p_expected_movement_type;
    END IF;
END;
$$;


--
-- Name: check_sale_totals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_sale_totals(p_sale_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    s      sales%ROWTYPE;
    v_sub  NUMERIC;
    v_disc NUMERIC;
    v_tax  NUMERIC;
BEGIN
    SELECT * INTO s FROM sales WHERE id = p_sale_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(round(quantity * unit_price, 2)), 0),
           COALESCE(SUM(discount_amount), 0),
           COALESCE(SUM(tax_amount), 0)
      INTO v_sub, v_disc, v_tax
      FROM sale_items
     WHERE sale_id = p_sale_id;

    IF s.subtotal_amount <> v_sub OR s.discount_amount <> v_disc OR s.tax_amount <> v_tax THEN
        RAISE EXCEPTION 'sale % header totals do not match its line items', p_sale_id;
    END IF;
END;
$$;


--
-- Name: check_tenant_has_active_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_tenant_has_active_owner(p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
    v_tenant_status VARCHAR(20);
    v_owner_count   INT;
BEGIN
    SELECT status INTO v_tenant_status FROM tenants WHERE id = p_tenant_id FOR SHARE;

    IF v_tenant_status NOT IN ('trial', 'active') THEN
        RETURN;
    END IF;

    SELECT count(*) INTO v_owner_count
    FROM tenant_memberships tm
    JOIN roles r ON r.id = tm.role_id
    WHERE tm.tenant_id = p_tenant_id
      AND r.is_owner_role
      AND tm.status = 'active';

    IF v_owner_count = 0 THEN
        RAISE EXCEPTION
            'tenant % is % and must retain at least one active owner membership',
            p_tenant_id, v_tenant_status;
    END IF;
END;
$$;


--
-- Name: customer_credit_ledger_reject_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_credit_ledger_reject_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'customer_credit_ledger is append-only; record a correcting entry instead';
END;
$$;


--
-- Name: customer_credit_ledger_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_credit_ledger_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale_customer_id  UUID;
    v_original_amount   NUMERIC(12,2);
    v_original_customer UUID;
BEGIN
    IF NEW.sale_id IS NOT NULL THEN
        SELECT customer_id INTO v_sale_customer_id
          FROM sales
         WHERE id = NEW.sale_id AND tenant_id = NEW.tenant_id AND store_id = NEW.store_id;

        IF v_sale_customer_id IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'customer_credit_ledger % customer does not match sale % customer',
                NEW.id, NEW.sale_id;
        END IF;
    END IF;

    IF NEW.reverses_entry_id IS NOT NULL THEN
        SELECT amount, customer_id INTO v_original_amount, v_original_customer
          FROM customer_credit_ledger
         WHERE id = NEW.reverses_entry_id AND tenant_id = NEW.tenant_id;

        IF NEW.amount <> -1 * v_original_amount THEN
            RAISE EXCEPTION 'CREDIT_REVERSAL % must exactly negate entry % (expected %, got %)',
                NEW.id, NEW.reverses_entry_id, -1 * v_original_amount, NEW.amount;
        END IF;
        IF NEW.customer_id <> v_original_customer THEN
            RAISE EXCEPTION 'CREDIT_REVERSAL % customer must match the entry it reverses (%)',
                NEW.id, NEW.reverses_entry_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: find_login_credentials(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_login_credentials(p_email character varying) RETURNS TABLE(user_id uuid, password_hash character varying, tenant_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    SELECT u.id, u.password_hash, tm.tenant_id
      FROM users u
      LEFT JOIN tenant_memberships tm
             ON tm.user_id = u.id AND tm.status = 'active'
     WHERE u.email = p_email
     LIMIT 1;
$$;


--
-- Name: inventory_batches_prevent_core_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_batches_prevent_core_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id
       OR NEW.purchase_item_id IS DISTINCT FROM OLD.purchase_item_id
       OR NEW.sale_return_item_id IS DISTINCT FROM OLD.sale_return_item_id
       OR NEW.barcode <> OLD.barcode
       OR NEW.received_quantity <> OLD.received_quantity
       OR NEW.unit_cost <> OLD.unit_cost
       OR NEW.received_at <> OLD.received_at THEN
        RAISE EXCEPTION 'inventory_batches are immutable except for available_quantity (batch %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: platform_list_tenants(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_list_tenants(p_search character varying DEFAULT NULL::character varying) RETURNS TABLE(id uuid, name character varying, slug character varying, status character varying, created_at timestamp with time zone, owner_email character varying)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
    LEFT JOIN tenant_memberships tm
        ON tm.tenant_id = t.id
       AND tm.role_id = (SELECT r.id FROM roles r WHERE r.tenant_id = t.id AND r.is_owner_role)
    LEFT JOIN users u ON u.id = tm.user_id
    WHERE p_search IS NULL
       OR t.name ILIKE '%' || p_search || '%'
       OR t.slug ILIKE '%' || p_search || '%'
    ORDER BY t.created_at DESC;
END;
$$;


--
-- Name: provision_new_account(character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provision_new_account(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_tenant_name character varying, p_tenant_slug character varying, p_store_name character varying, p_store_code character varying) RETURNS TABLE(user_id uuid, tenant_id uuid, store_id uuid, membership_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
    v_user_id       UUID;
    v_tenant_id     UUID;
    v_store_id      UUID;
    v_owner_role_id UUID;
    v_membership_id UUID;
BEGIN
    INSERT INTO users (email, password_hash, first_name, last_name)
    VALUES (lower(p_email), p_password_hash, p_first_name, p_last_name)
    RETURNING id INTO v_user_id;

    INSERT INTO tenants (name, slug, status)
    VALUES (p_tenant_name, p_tenant_slug, 'trial')
    RETURNING id INTO v_tenant_id;

    INSERT INTO stores (tenant_id, name, code)
    VALUES (v_tenant_id, p_store_name, p_store_code)
    RETURNING id INTO v_store_id;

    INSERT INTO roles (tenant_id, name, description, is_owner_role)
    VALUES (v_tenant_id, 'Owner', 'Everything, including users and settings.', true)
    RETURNING id INTO v_owner_role_id;

    INSERT INTO role_permissions (role_id, tenant_id, area, access_level)
    SELECT v_owner_role_id, v_tenant_id, area, 'delete'
    FROM unnest(ARRAY[
        'dashboard', 'stocks', 'catalogue', 'vendors', 'purchases',
        'expenses', 'pos', 'sales', 'customers', 'settings', 'users'
    ]) AS area;

    INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
    VALUES (v_tenant_id, v_user_id, v_owner_role_id, 'active')
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_user_id, v_tenant_id, v_store_id, v_membership_id;
END;
$$;


--
-- Name: purchase_items_prevent_parent_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_items_prevent_parent_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.purchase_id <> OLD.purchase_id THEN
        RAISE EXCEPTION 'purchase_items tenant_id, store_id and purchase_id are immutable (item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: purchase_items_require_open_purchase(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_items_require_open_purchase() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM purchases
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_id ELSE NEW.purchase_id END;

    IF v_status NOT IN ('draft', 'ordered') THEN
        RAISE EXCEPTION 'purchase lines cannot be changed once the purchase is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: purchase_items_validate_variant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_items_validate_variant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_store_id UUID;
    v_kind     VARCHAR(20);
BEGIN
    SELECT s.store_id, s.kind INTO v_store_id, v_kind
      FROM variants v
      JOIN sellables s ON s.id = v.sellable_id AND s.tenant_id = v.tenant_id
     WHERE v.id = NEW.variant_id AND v.tenant_id = NEW.tenant_id;

    IF v_store_id IS DISTINCT FROM NEW.store_id THEN
        RAISE EXCEPTION 'variant % does not belong to store %', NEW.variant_id, NEW.store_id;
    END IF;
    IF v_kind <> 'product' THEN
        RAISE EXCEPTION 'variant % is a % and cannot be purchased as stock', NEW.variant_id, v_kind;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: purchase_return_items_prevent_identity_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_return_items_prevent_identity_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id
       OR NEW.purchase_return_id <> OLD.purchase_return_id
       OR NEW.purchase_item_id <> OLD.purchase_item_id
       OR NEW.batch_id <> OLD.batch_id THEN
        RAISE EXCEPTION 'purchase_return_items identity columns are immutable (item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: purchase_return_items_require_draft_return(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_return_items_require_draft_return() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM purchase_returns
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_return_id ELSE NEW.purchase_return_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'purchase_return_items cannot be changed once the return is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: purchase_return_items_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_return_items_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_batch_purchase_item_id UUID;
    v_batch_unit_cost        NUMERIC(12,2);
    v_return_purchase_id     UUID;
    v_item_purchase_id       UUID;
BEGIN
    SELECT purchase_item_id, unit_cost INTO v_batch_purchase_item_id, v_batch_unit_cost
      FROM inventory_batches
     WHERE id = NEW.batch_id AND tenant_id = NEW.tenant_id;

    IF v_batch_purchase_item_id <> NEW.purchase_item_id THEN
        RAISE EXCEPTION 'batch % was not received against purchase item %', NEW.batch_id, NEW.purchase_item_id;
    END IF;

    IF NEW.unit_cost <> v_batch_unit_cost THEN
        RAISE EXCEPTION 'purchase_return_items.unit_cost must match batch % cost basis (%), got %',
            NEW.batch_id, v_batch_unit_cost, NEW.unit_cost;
    END IF;

    SELECT purchase_id INTO v_item_purchase_id
      FROM purchase_items
     WHERE id = NEW.purchase_item_id AND tenant_id = NEW.tenant_id;

    SELECT purchase_id INTO v_return_purchase_id
      FROM purchase_returns
     WHERE id = NEW.purchase_return_id AND tenant_id = NEW.tenant_id;

    IF v_item_purchase_id <> v_return_purchase_id THEN
        RAISE EXCEPTION 'purchase item % does not belong to the purchase being returned against (return %)',
            NEW.purchase_item_id, NEW.purchase_return_id;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: purchase_returns_guard_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_returns_guard_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.purchase_id <> OLD.purchase_id THEN
        RAISE EXCEPTION 'purchase_returns tenant_id, store_id and purchase_id are immutable (return %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'draft'     AND NEW.status = 'completed')
            OR (OLD.status = 'completed' AND NEW.status = 'reversed')
        ) THEN
            RAISE EXCEPTION 'purchase_return % cannot go from % to %', OLD.id, OLD.status, NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: purchase_returns_require_received_purchase(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchase_returns_require_received_purchase() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM purchases WHERE id = NEW.purchase_id;

    IF v_status <> 'received' THEN
        RAISE EXCEPTION 'purchase % is % and is not eligible for a return', NEW.purchase_id, v_status;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: purchases_guard_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purchases_guard_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id THEN
        RAISE EXCEPTION 'purchases tenant_id and store_id are immutable (purchase %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'draft'   AND NEW.status IN ('ordered', 'cancelled'))
            OR (OLD.status = 'ordered' AND NEW.status IN ('received', 'cancelled'))
        ) THEN
            RAISE EXCEPTION 'purchase % cannot go from % to %', OLD.id, OLD.status, NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sale_item_batches_prevent_identity_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_item_batches_prevent_identity_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id OR NEW.sale_item_id <> OLD.sale_item_id
       OR NEW.batch_id <> OLD.batch_id THEN
        RAISE EXCEPTION 'sale_item_batches identity columns are immutable (allocation %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sale_item_batches_require_draft_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_item_batches_require_draft_sale() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT s.status INTO v_status
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
     WHERE si.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_item_id ELSE NEW.sale_item_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_item_batches cannot be changed once the sale is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: sale_items_prevent_parent_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_items_prevent_parent_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.sale_id <> OLD.sale_id THEN
        RAISE EXCEPTION 'sale_items tenant_id, store_id and sale_id are immutable (item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sale_items_require_active_variant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_items_require_active_variant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_variant_status  VARCHAR(20);
    v_sellable_status VARCHAR(20);
BEGIN
    SELECT v.status, s.status INTO v_variant_status, v_sellable_status
      FROM variants v
      JOIN sellables s ON s.id = v.sellable_id AND s.tenant_id = v.tenant_id
     WHERE v.id = NEW.variant_id AND v.tenant_id = NEW.tenant_id;

    IF v_variant_status <> 'active' THEN
        RAISE EXCEPTION 'variant % is % and cannot be sold', NEW.variant_id, v_variant_status;
    END IF;
    IF v_sellable_status <> 'active' THEN
        RAISE EXCEPTION 'variant % belongs to a % sellable and cannot be sold', NEW.variant_id, v_sellable_status;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: sale_items_require_draft_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_items_require_draft_sale() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM sales
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_items cannot be changed once the sale is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: sale_items_validate_variant_store(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_items_validate_variant_store() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT store_id INTO v_store_id
      FROM variants
     WHERE id = NEW.variant_id AND tenant_id = NEW.tenant_id;

    IF v_store_id IS DISTINCT FROM NEW.store_id THEN
        RAISE EXCEPTION 'variant % does not belong to store %', NEW.variant_id, NEW.store_id;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: sale_payments_prevent_identity_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_payments_prevent_identity_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.sale_id <> OLD.sale_id THEN
        RAISE EXCEPTION 'sale_payments tenant_id, store_id and sale_id are immutable (payment %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sale_payments_require_draft_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_payments_require_draft_sale() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM sales
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_payments cannot be changed once the sale is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: sale_payments_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_payments_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_is_credit BOOLEAN;
BEGIN
    SELECT is_customer_credit INTO v_is_credit
      FROM payment_methods
     WHERE id = NEW.payment_method_id AND tenant_id = NEW.tenant_id;

    IF v_is_credit AND NEW.payment_account_id IS NOT NULL THEN
        RAISE EXCEPTION 'sale_payment % uses a customer-credit method and must not name a payment_account', NEW.id;
    ELSIF NOT v_is_credit AND NEW.payment_account_id IS NULL THEN
        RAISE EXCEPTION 'sale_payment % must name a payment_account unless its method is customer credit', NEW.id;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: sale_return_items_prevent_identity_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_return_items_prevent_identity_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id OR NEW.sale_return_id <> OLD.sale_return_id
       OR NEW.sale_item_id <> OLD.sale_item_id OR NEW.sale_item_batch_id <> OLD.sale_item_batch_id THEN
        RAISE EXCEPTION 'sale_return_items identity columns are immutable (return item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sale_return_items_require_draft_return(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_return_items_require_draft_return() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM sale_returns
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_return_id ELSE NEW.sale_return_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_return_items cannot be changed once the return is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: sale_returns_guard_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_returns_guard_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.sale_id <> OLD.sale_id THEN
        RAISE EXCEPTION 'sale_returns tenant_id, store_id and sale_id are immutable (return %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status AND NOT (OLD.status = 'draft' AND NEW.status = 'completed') THEN
        RAISE EXCEPTION 'sale_return % cannot go from % to %', OLD.id, OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sale_returns_require_completed_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sale_returns_require_completed_sale() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM sales WHERE id = NEW.sale_id;

    IF v_status <> 'completed' THEN
        RAISE EXCEPTION 'sale % is % and is not eligible for a return', NEW.sale_id, v_status;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: sales_guard_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sales_guard_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id THEN
        RAISE EXCEPTION 'sales tenant_id and store_id are immutable (sale %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'draft'     AND NEW.status = 'completed')
            OR (OLD.status = 'completed' AND NEW.status = 'voided')
        ) THEN
            RAISE EXCEPTION 'sale % cannot go from % to %', OLD.id, OLD.status, NEW.status;
        END IF;
        -- voiding restores the FULL originally-sold quantity via SOLD_REVERSAL; a completed
        -- sale_return has already restored part (or all) of it via its own return batch, so
        -- allowing both would double-count stock. See sale_returns for the other half of
        -- this guard (a return cannot complete against a sale that is no longer completed)
        IF OLD.status = 'completed' AND NEW.status = 'voided'
           AND EXISTS (SELECT 1 FROM sale_returns WHERE sale_id = OLD.id AND status = 'completed') THEN
            RAISE EXCEPTION 'sale % has a completed sale_return and cannot be voided', OLD.id;
        END IF;
    END IF;
    IF OLD.status <> 'draft' AND (
        NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.sale_number IS DISTINCT FROM OLD.sale_number
        OR NEW.sold_at <> OLD.sold_at
    ) THEN
        RAISE EXCEPTION 'sale % is % and its commercial details are immutable', OLD.id, OLD.status;
    END IF;
    -- void_reason may only be set by the completed -> voided transition itself,
    -- and is frozen forever after that (voided is already terminal, but this
    -- also blocks setting it early on a still-draft/completed row)
    IF NEW.void_reason IS DISTINCT FROM OLD.void_reason
       AND NOT (OLD.status = 'completed' AND NEW.status = 'voided') THEN
        RAISE EXCEPTION 'sale % void_reason can only be set when voiding the sale', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sellables_prevent_identity_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sellables_prevent_identity_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.kind <> OLD.kind THEN
        RAISE EXCEPTION 'sellables tenant_id, store_id and kind are immutable (sellable %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


--
-- Name: stock_movement_sign(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_movement_sign(p_movement_type character varying) RETURNS smallint
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    RETURN CASE p_movement_type
        WHEN 'PURCHASED'                THEN  1
        WHEN 'SALE_RETURN'              THEN  1
        WHEN 'PURCHASE_RETURN_REVERSAL' THEN  1
        WHEN 'SOLD_REVERSAL'            THEN  1
        WHEN 'SOLD'                     THEN -1
        WHEN 'PURCHASE_RETURN'          THEN -1
        WHEN 'DAMAGED'                  THEN -1
        WHEN 'LOST'                     THEN -1
        WHEN 'INTERNAL_USE'             THEN -1
        ELSE NULL
    END;
END;
$$;


--
-- Name: stock_movements_reject_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_movements_reject_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements is append-only; record a correcting movement instead';
END;
$$;


--
-- Name: tenants_prevent_slug_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenants_prevent_slug_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.slug <> OLD.slug THEN
        RAISE EXCEPTION 'tenants.slug is immutable and cannot be changed (tenant %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_fn_categories_one_level_deep(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_categories_one_level_deep() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_parent_has_parent BOOLEAN;
    v_has_children       BOOLEAN;
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        SELECT (parent_id IS NOT NULL) INTO v_parent_has_parent
        FROM categories WHERE id = NEW.parent_id;

        IF v_parent_has_parent IS NULL THEN
            RAISE EXCEPTION 'parent category % does not exist', NEW.parent_id;
        END IF;
        IF v_parent_has_parent THEN
            RAISE EXCEPTION 'category % is already a subcategory and cannot have its own subcategories', NEW.parent_id;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
        SELECT EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id) INTO v_has_children;
        IF v_has_children THEN
            RAISE EXCEPTION 'category % has subcategories and cannot become a subcategory itself', NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_fn_inventory_batches_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_inventory_batches_insert_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_purchase_status VARCHAR(20);
    v_item_quantity   INTEGER;
    -- SUM() over an integer column returns bigint
    v_received_total  BIGINT;
    v_return_status   VARCHAR(20);
BEGIN
    IF NEW.purchase_item_id IS NOT NULL THEN
        SELECT p.status, pi.quantity
          INTO v_purchase_status, v_item_quantity
          FROM purchase_items pi
          JOIN purchases p ON p.id = pi.purchase_id AND p.tenant_id = pi.tenant_id
         WHERE pi.id = NEW.purchase_item_id;

        IF v_purchase_status <> 'received' THEN
            RAISE EXCEPTION 'batch % needs a received purchase (purchase is %)', NEW.id, v_purchase_status;
        END IF;

        -- one line may be split into several batches, but together they cannot exceed the line
        SELECT COALESCE(SUM(received_quantity), 0) INTO v_received_total
          FROM inventory_batches
         WHERE purchase_item_id = NEW.purchase_item_id;

        IF v_received_total > v_item_quantity THEN
            RAISE EXCEPTION 'batches for purchase item % total %, more than the purchased %',
                NEW.purchase_item_id, v_received_total, v_item_quantity;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM stock_movements
             WHERE batch_id = NEW.id
               AND movement_type = 'PURCHASED'
               AND quantity = NEW.received_quantity
        ) THEN
            RAISE EXCEPTION 'batch % has no matching PURCHASED stock movement', NEW.id;
        END IF;
    ELSE
        SELECT sr.status INTO v_return_status
          FROM sale_return_items sri
          JOIN sale_returns sr ON sr.id = sri.sale_return_id AND sr.tenant_id = sri.tenant_id
         WHERE sri.id = NEW.sale_return_item_id;

        IF v_return_status <> 'completed' THEN
            RAISE EXCEPTION 'batch % needs a completed sale return (return is %)', NEW.id, v_return_status;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM stock_movements
             WHERE batch_id = NEW.id
               AND movement_type = 'SALE_RETURN'
               AND quantity = NEW.received_quantity
        ) THEN
            RAISE EXCEPTION 'batch % has no matching SALE_RETURN stock movement', NEW.id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: trg_fn_purchase_returns_completion_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_purchase_returns_completion_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status = 'draft' THEN
        IF NOT EXISTS (SELECT 1 FROM purchase_return_items WHERE purchase_return_id = NEW.id) THEN
            RAISE EXCEPTION 'purchase_return % has no items to complete', NEW.id;
        END IF;
        PERFORM check_purchase_return_movements(NEW.id, 'PURCHASE_RETURN');
    ELSIF NEW.status = 'reversed' AND OLD.status = 'completed' THEN
        PERFORM check_purchase_return_movements(NEW.id, 'PURCHASE_RETURN_REVERSAL');
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: trg_fn_purchase_totals_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_purchase_totals_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_TABLE_NAME = 'purchases' THEN
        PERFORM check_purchase_totals(NEW.id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM check_purchase_totals(OLD.purchase_id);
    ELSE
        PERFORM check_purchase_totals(NEW.purchase_id);
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: trg_fn_role_permissions_protect_owner_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_role_permissions_protect_owner_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_is_owner_role BOOLEAN;
BEGIN
    SELECT is_owner_role INTO v_is_owner_role
    FROM roles WHERE id = COALESCE(NEW.role_id, OLD.role_id);

    -- a missing parent row here means ON DELETE CASCADE already removed it as
    -- part of deleting the (necessarily non-Owner - the guard on roles itself
    -- blocks deleting the real Owner role) parent role; NULL must read as
    -- "not the Owner role", not fall through to the opposite via NOT NULL = NULL
    IF COALESCE(v_is_owner_role, false) IS NOT TRUE THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'the Owner role''s permissions cannot be removed';
    END IF;
    IF NEW.access_level <> 'delete' THEN
        RAISE EXCEPTION 'the Owner role always has full access to every area';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_fn_roles_protect_owner_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_roles_protect_owner_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_owner_role THEN
            RAISE EXCEPTION 'the Owner role cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.is_owner_role IS DISTINCT FROM NEW.is_owner_role THEN
        RAISE EXCEPTION 'is_owner_role cannot change after a role is created';
    END IF;
    IF OLD.is_owner_role AND OLD.name IS DISTINCT FROM NEW.name THEN
        RAISE EXCEPTION 'the Owner role cannot be renamed';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_fn_sale_item_batches_allocation_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_sale_item_batches_allocation_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale_item_id UUID;
    v_quantity     INTEGER;
    v_allocated    INTEGER;
BEGIN
    v_sale_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_item_id ELSE NEW.sale_item_id END;

    SELECT quantity INTO v_quantity FROM sale_items WHERE id = v_sale_item_id;

    SELECT COALESCE(SUM(quantity), 0) INTO v_allocated
      FROM sale_item_batches WHERE sale_item_id = v_sale_item_id;

    IF v_allocated > v_quantity THEN
        RAISE EXCEPTION 'sale item % batch allocations (%) exceed its quantity (%)',
            v_sale_item_id, v_allocated, v_quantity;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: trg_fn_sale_returns_completion_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_sale_returns_completion_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale_status   VARCHAR(20);
    v_missing_batch INTEGER;
    v_over_returned INTEGER;
BEGIN
    IF NOT (NEW.status = 'completed' AND OLD.status = 'draft') THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM sale_return_items WHERE sale_return_id = NEW.id) THEN
        RAISE EXCEPTION 'sale_return % has no items to complete', NEW.id;
    END IF;

    -- the sale must STILL be completed — it may have been voided since this return was
    -- drafted, which is exactly the double-restore scenario this guard exists to prevent
    -- (see sales_guard_update's matching check on the other side of that same scenario)
    SELECT status INTO v_sale_status FROM sales WHERE id = NEW.sale_id;
    IF v_sale_status <> 'completed' THEN
        RAISE EXCEPTION 'sale % is % and sale_return % can no longer be completed against it',
            NEW.sale_id, v_sale_status, NEW.id;
    END IF;

    -- lock every original sale_item_batches allocation this return draws from, BEFORE
    -- computing how much of it has already been returned. Without this lock, two
    -- concurrent completions against the same original allocation could each read the
    -- same "already returned" total, each independently pass the ceiling check below,
    -- and together over-return it — a plain read-then-check-then-act race, invisible to
    -- any test that doesn't run two completions at once. Locking first forces the second
    -- transaction's completion to block here until the first commits (or rolls back), so
    -- its own check below is guaranteed to see the first return's now-committed total.
    -- Same idiom as check_tenant_has_active_owner's `FOR SHARE` lock on tenants — lock the
    -- shared resource before reading an aggregate over it. ORDER BY id gives every
    -- concurrent completion the same lock-acquisition order, so two returns naming the
    -- same batches in a different order can't deadlock against each other.
    PERFORM 1
      FROM sale_item_batches
     WHERE id IN (SELECT sale_item_batch_id FROM sale_return_items WHERE sale_return_id = NEW.id)
     ORDER BY id
       FOR UPDATE;

    -- no original batch allocation may end up over-returned once this return's own
    -- quantities are counted alongside every OTHER already-completed return's quantities
    -- against it. Draft returns (this one's siblings, not this one itself) are deliberately
    -- excluded — no reservation during draft, the same choice already made for sale_item_batches
    -- during a draft sale; a conflicting draft simply fails here, at ITS OWN completion, later.
    -- Safe to compute now: the lock above guarantees no concurrent completion can change
    -- these totals out from under this read.
    SELECT count(*) INTO v_over_returned
      FROM (
          SELECT sib.id, sib.quantity AS allowed, SUM(sri2.quantity) AS total_returned
            FROM sale_item_batches sib
            JOIN sale_return_items sri2 ON sri2.sale_item_batch_id = sib.id
            JOIN sale_returns sr2 ON sr2.id = sri2.sale_return_id
           WHERE sr2.status = 'completed' OR sr2.id = NEW.id
           GROUP BY sib.id, sib.quantity
      ) totals
     WHERE totals.total_returned > totals.allowed;

    IF v_over_returned > 0 THEN
        RAISE EXCEPTION 'sale_return % returns more than remains returnable for % batch allocation(s)',
            NEW.id, v_over_returned;
    END IF;

    -- every return line must have produced its own return-origin batch, of the matching
    -- quantity, with a matching SALE_RETURN movement — mirrors check_sale_item_batch_movements
    -- (see sales) one layer over, for the return side
    SELECT count(*) INTO v_missing_batch
      FROM sale_return_items sri
     WHERE sri.sale_return_id = NEW.id
       AND NOT EXISTS (
           SELECT 1 FROM inventory_batches ib
            WHERE ib.sale_return_item_id = sri.id
              AND ib.received_quantity = sri.quantity
              AND EXISTS (
                  SELECT 1 FROM stock_movements sm
                   WHERE sm.batch_id = ib.id
                     AND sm.movement_type = 'SALE_RETURN'
                     AND sm.reference_type = 'SALE_RETURN'
                     AND sm.reference_id = sri.id
                     AND sm.quantity = sri.quantity
              )
       );

    IF v_missing_batch > 0 THEN
        RAISE EXCEPTION 'sale_return % is missing % return batch/movement pair(s)', NEW.id, v_missing_batch;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: trg_fn_sale_totals_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_sale_totals_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_TABLE_NAME = 'sales' THEN
        PERFORM check_sale_totals(NEW.id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM check_sale_totals(OLD.sale_id);
    ELSE
        PERFORM check_sale_totals(NEW.sale_id);
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: trg_fn_sales_completion_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_sales_completion_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_unallocated INTEGER;
    v_paid        NUMERIC(14,2);
BEGIN
    IF NEW.status = 'completed' AND OLD.status = 'draft' THEN
        IF NOT EXISTS (SELECT 1 FROM sale_items WHERE sale_id = NEW.id) THEN
            RAISE EXCEPTION 'sale % has no items to complete', NEW.id;
        END IF;

        -- every sale item must be fully allocated to batches: sum(allocations) = quantity
        SELECT count(*) INTO v_unallocated
          FROM sale_items si
         WHERE si.sale_id = NEW.id
           AND si.quantity <> COALESCE(
               (SELECT SUM(sib.quantity) FROM sale_item_batches sib
                 WHERE sib.sale_item_id = si.id), 0);

        IF v_unallocated > 0 THEN
            RAISE EXCEPTION 'sale % has % item(s) not fully allocated to batches', NEW.id, v_unallocated;
        END IF;

        PERFORM check_sale_item_batch_movements(NEW.id, 'SOLD');

        -- payments must sum exactly to the sale total: no unexplained underpayment,
        -- customer credit counts because it is itself a sale_payments row
        SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sale_payments WHERE sale_id = NEW.id;
        IF v_paid <> NEW.total_amount THEN
            RAISE EXCEPTION 'sale % payments (%) do not equal its total (%)',
                NEW.id, v_paid, NEW.total_amount;
        END IF;

        -- every customer-credit payment must have produced a CREDIT_SALE ledger entry
        IF EXISTS (
            SELECT 1 FROM sale_payments sp
              JOIN payment_methods pm ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
             WHERE sp.sale_id = NEW.id AND pm.is_customer_credit
               AND NOT EXISTS (
                   SELECT 1 FROM customer_credit_ledger ccl
                    WHERE ccl.sale_payment_id = sp.id AND ccl.entry_type = 'CREDIT_SALE'
               )
        ) THEN
            RAISE EXCEPTION 'sale % has a customer-credit payment with no matching CREDIT_SALE ledger entry', NEW.id;
        END IF;

    ELSIF NEW.status = 'voided' AND OLD.status = 'completed' THEN
        -- every batch allocation must have a compensating SOLD_REVERSAL movement,
        -- restoring exactly what was sold
        PERFORM check_sale_item_batch_movements(NEW.id, 'SOLD_REVERSAL');

        -- every CREDIT_SALE tied to this sale must have a matching CREDIT_REVERSAL
        IF EXISTS (
            SELECT 1 FROM customer_credit_ledger ccl
             WHERE ccl.sale_id = NEW.id AND ccl.entry_type = 'CREDIT_SALE'
               AND NOT EXISTS (
                   SELECT 1 FROM customer_credit_ledger rev
                    WHERE rev.reverses_entry_id = ccl.id AND rev.entry_type = 'CREDIT_REVERSAL'
               )
        ) THEN
            RAISE EXCEPTION 'sale % has a CREDIT_SALE entry with no matching CREDIT_REVERSAL', NEW.id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: trg_fn_stock_movements_apply_to_batch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_stock_movements_apply_to_batch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
    UPDATE inventory_batches
       SET available_quantity = available_quantity
                                 + (NEW.quantity * stock_movement_sign(NEW.movement_type))
     WHERE id = NEW.batch_id
       AND tenant_id = NEW.tenant_id
       AND store_id = NEW.store_id
       AND variant_id = NEW.variant_id;

    RETURN NEW;
END;
$$;


--
-- Name: trg_fn_tenant_memberships_owner_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_tenant_memberships_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM check_tenant_has_active_owner(OLD.tenant_id);
        RETURN OLD;
    END IF;

    PERFORM check_tenant_has_active_owner(NEW.tenant_id);
    RETURN NEW;
END;
$$;


--
-- Name: trg_fn_tenants_owner_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_tenants_owner_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status IN ('trial', 'active')
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        PERFORM check_tenant_has_active_owner(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: variants_prevent_parent_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.variants_prevent_parent_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.sellable_id <> OLD.sellable_id THEN
        RAISE EXCEPTION 'variants tenant_id, store_id and sellable_id are immutable (variant %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    movement_type character varying(30) NOT NULL,
    quantity integer NOT NULL,
    reference_type character varying(30),
    reference_id uuid,
    reason character varying(500),
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movements_quantity_positive_check CHECK ((quantity > 0)),
    CONSTRAINT stock_movements_reference_pair_check CHECK (((reference_type IS NULL) = (reference_id IS NULL))),
    CONSTRAINT stock_movements_reference_type_check CHECK (((reference_type)::text = ANY ((ARRAY['PURCHASE_ITEM'::character varying, 'SALE_ITEM'::character varying, 'PURCHASE_RETURN'::character varying, 'SALE_RETURN'::character varying, 'STOCK_ADJUSTMENT'::character varying])::text[]))),
    CONSTRAINT stock_movements_type_check CHECK (((movement_type)::text = ANY ((ARRAY['PURCHASED'::character varying, 'SOLD'::character varying, 'PURCHASE_RETURN'::character varying, 'SALE_RETURN'::character varying, 'DAMAGED'::character varying, 'LOST'::character varying, 'INTERNAL_USE'::character varying, 'PURCHASE_RETURN_REVERSAL'::character varying, 'SOLD_REVERSAL'::character varying])::text[])))
);


--
-- Name: batch_stock_on_hand; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.batch_stock_on_hand WITH (security_invoker='true') AS
 SELECT tenant_id,
    store_id,
    variant_id,
    batch_id,
    sum((quantity * public.stock_movement_sign(movement_type))) AS on_hand
   FROM public.stock_movements
  GROUP BY tenant_id, store_id, variant_id, batch_id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    parent_id uuid,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credit_ledger (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    store_id uuid NOT NULL,
    sale_id uuid,
    sale_payment_id uuid,
    entry_type character varying(30) NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reference character varying(100),
    notes text,
    reverses_entry_id uuid,
    CONSTRAINT customer_credit_ledger_amount_nonzero_check CHECK ((amount <> (0)::numeric)),
    CONSTRAINT customer_credit_ledger_entry_type_check CHECK (((entry_type)::text = ANY ((ARRAY['CREDIT_SALE'::character varying, 'CREDIT_PAYMENT'::character varying, 'CREDIT_ADJUSTMENT'::character varying, 'CREDIT_REVERSAL'::character varying])::text[]))),
    CONSTRAINT customer_credit_ledger_reverses_pair_check CHECK ((((entry_type)::text = 'CREDIT_REVERSAL'::text) = (reverses_entry_id IS NOT NULL))),
    CONSTRAINT customer_credit_ledger_sale_payment_pair_check CHECK ((((entry_type)::text = 'CREDIT_SALE'::text) = (sale_payment_id IS NOT NULL))),
    CONSTRAINT customer_credit_ledger_sign_check CHECK (((((entry_type)::text = 'CREDIT_SALE'::text) AND (amount > (0)::numeric)) OR (((entry_type)::text = 'CREDIT_PAYMENT'::text) AND (amount < (0)::numeric)) OR ((entry_type)::text = ANY ((ARRAY['CREDIT_ADJUSTMENT'::character varying, 'CREDIT_REVERSAL'::character varying])::text[]))))
);


--
-- Name: customer_credit_balance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_credit_balance WITH (security_invoker='true') AS
 SELECT tenant_id,
    customer_id,
    sum(amount) AS balance
   FROM public.customer_credit_ledger
  GROUP BY tenant_id, customer_id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    phone character varying(20),
    email character varying(255),
    address text,
    notes text,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customers_email_lowercase_check CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT customers_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: inventory_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_batches (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    purchase_item_id uuid,
    sale_return_item_id uuid,
    barcode character varying(64) NOT NULL,
    received_quantity integer NOT NULL,
    available_quantity integer DEFAULT 0 NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_batches_available_quantity_check CHECK ((available_quantity >= 0)),
    CONSTRAINT inventory_batches_origin_check CHECK (((purchase_item_id IS NOT NULL) <> (sale_return_item_id IS NOT NULL))),
    CONSTRAINT inventory_batches_received_quantity_check CHECK ((received_quantity > 0)),
    CONSTRAINT inventory_batches_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: membership_store_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_store_access (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    store_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_accounts (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    code character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_accounts_code_lowercase_check CHECK ((((code)::text = lower((code)::text)) AND ((code)::text ~ '^[a-z0-9-]+$'::text))),
    CONSTRAINT payment_accounts_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'disabled'::character varying])::text[])))
);


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(30) NOT NULL,
    is_customer_credit boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_methods_code_format_check CHECK ((((code)::text = upper((code)::text)) AND ((code)::text ~ '^[A-Z0-9_]+$'::text))),
    CONSTRAINT payment_methods_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'disabled'::character varying])::text[])))
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id uuid DEFAULT uuidv7() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_admins_email_lowercase_check CHECK (((email)::text = lower((email)::text)))
);


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    line_total numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_items_discount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT purchase_items_discount_within_line_check CHECK ((discount_amount <= ((quantity)::numeric * unit_cost))),
    CONSTRAINT purchase_items_line_total_check CHECK ((line_total = round(((((quantity)::numeric * unit_cost) - discount_amount) + tax_amount), 2))),
    CONSTRAINT purchase_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT purchase_items_tax_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT purchase_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    purchase_return_id uuid NOT NULL,
    purchase_item_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    line_total numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_return_items_line_total_check CHECK ((line_total = round((((quantity)::numeric * unit_cost) + tax_amount), 2))),
    CONSTRAINT purchase_return_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT purchase_return_items_tax_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT purchase_return_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_returns (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    return_date date DEFAULT CURRENT_DATE NOT NULL,
    reason character varying(500),
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_returns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'completed'::character varying, 'reversed'::character varying])::text[])))
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    reference_number character varying(100),
    purchase_date date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    subtotal_amount numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    adjustment_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchases_discount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT purchases_received_at_check CHECK ((((status)::text = 'received'::text) = (received_at IS NOT NULL))),
    CONSTRAINT purchases_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'ordered'::character varying, 'received'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT purchases_subtotal_check CHECK ((subtotal_amount >= (0)::numeric)),
    CONSTRAINT purchases_tax_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT purchases_total_check CHECK ((total_amount = (((subtotal_amount - discount_amount) + tax_amount) + adjustment_amount)))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    area character varying(20) NOT NULL,
    access_level character varying(10) DEFAULT 'none'::character varying NOT NULL,
    CONSTRAINT role_permissions_access_level_check CHECK (((access_level)::text = ANY ((ARRAY['none'::character varying, 'view'::character varying, 'edit'::character varying, 'delete'::character varying])::text[]))),
    CONSTRAINT role_permissions_area_check CHECK (((area)::text = ANY ((ARRAY['dashboard'::character varying, 'stocks'::character varying, 'catalogue'::character varying, 'vendors'::character varying, 'purchases'::character varying, 'expenses'::character varying, 'pos'::character varying, 'sales'::character varying, 'customers'::character varying, 'settings'::character varying, 'users'::character varying])::text[])))
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    is_owner_role boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description character varying(200) DEFAULT ''::character varying NOT NULL
);


--
-- Name: sale_item_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_item_batches (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    sale_item_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_item_batches_quantity_check CHECK ((quantity > 0))
);


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    sale_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    line_total numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_items_discount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT sale_items_line_total_check CHECK ((line_total = round(((((quantity)::numeric * unit_price) - discount_amount) + tax_amount), 2))),
    CONSTRAINT sale_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT sale_items_tax_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT sale_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: sale_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_payments (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    sale_id uuid NOT NULL,
    payment_method_id uuid NOT NULL,
    payment_account_id uuid,
    amount numeric(12,2) NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    reference character varying(100),
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: sale_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_return_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    sale_return_id uuid NOT NULL,
    sale_item_id uuid NOT NULL,
    sale_item_batch_id uuid NOT NULL,
    quantity integer NOT NULL,
    notes character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_return_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: sale_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_returns (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    sale_id uuid NOT NULL,
    return_number character varying(50),
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    reason character varying(500),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sale_returns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    customer_id uuid,
    sale_number character varying(50),
    sold_at timestamp with time zone DEFAULT now() NOT NULL,
    subtotal_amount numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    void_reason text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_discount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT sales_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'completed'::character varying, 'voided'::character varying])::text[]))),
    CONSTRAINT sales_subtotal_check CHECK ((subtotal_amount >= (0)::numeric)),
    CONSTRAINT sales_tax_check CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT sales_total_amount_check CHECK ((total_amount = ((subtotal_amount - discount_amount) + tax_amount))),
    CONSTRAINT sales_total_check CHECK ((total_amount >= (0)::numeric)),
    CONSTRAINT sales_void_reason_pair_check CHECK ((((status)::text = 'voided'::text) OR (void_reason IS NULL)))
);


--
-- Name: sellables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sellables (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    kind character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category_id uuid,
    CONSTRAINT sellables_kind_check CHECK (((kind)::text = ANY ((ARRAY['product'::character varying, 'service'::character varying])::text[]))),
    CONSTRAINT sellables_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    code character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    timezone character varying(64),
    currency character(3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stores_code_lowercase_check CHECK ((((code)::text = lower((code)::text)) AND ((code)::text ~ '^[a-z0-9-]+$'::text))),
    CONSTRAINT stores_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    phone character varying(20),
    email character varying(255),
    tax_id character varying(50),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    map_url character varying(500),
    CONSTRAINT suppliers_email_lowercase_check CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT suppliers_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: tenant_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_memberships (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid,
    invited_email character varying(255),
    status character varying(20) DEFAULT 'invited'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_id uuid NOT NULL,
    CONSTRAINT tenant_memberships_invited_email_lowercase_check CHECK (((invited_email)::text = lower((invited_email)::text))),
    CONSTRAINT tenant_memberships_status_check CHECK (((status)::text = ANY ((ARRAY['invited'::character varying, 'active'::character varying, 'suspended'::character varying, 'removed'::character varying])::text[]))),
    CONSTRAINT tenant_memberships_user_or_invite_check CHECK (((((status)::text = 'invited'::text) AND (user_id IS NULL) AND (invited_email IS NOT NULL)) OR (((status)::text <> 'invited'::text) AND (user_id IS NOT NULL))))
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT uuidv7() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(100) NOT NULL,
    status character varying(20) NOT NULL,
    default_currency character(3) DEFAULT 'INR'::bpchar NOT NULL,
    default_timezone character varying(64) DEFAULT 'Asia/Kolkata'::character varying NOT NULL,
    country_code character(2) DEFAULT 'IN'::bpchar NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_slug_lowercase_check CHECK ((((slug)::text = lower((slug)::text)) AND ((slug)::text ~ '^[a-z0-9-]+$'::text))),
    CONSTRAINT tenants_status_check CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'suspended'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT uuidv7() NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20),
    first_name character varying(100) NOT NULL,
    last_name character varying(100),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash character varying(255) NOT NULL,
    CONSTRAINT users_email_lowercase_check CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'deactivated'::character varying])::text[])))
);


--
-- Name: variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variants (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    sellable_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    sku character varying(64),
    base_price numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit character varying(20) DEFAULT 'pcs'::character varying NOT NULL,
    CONSTRAINT variants_base_price_check CHECK ((base_price >= (0)::numeric)),
    CONSTRAINT variants_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'deactivated'::character varying])::text[])))
);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: customer_credit_ledger customer_credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: customer_credit_ledger customer_credit_ledger_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: customers customers_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: inventory_batches inventory_batches_movement_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_movement_target_unique UNIQUE (tenant_id, store_id, id, variant_id);


--
-- Name: inventory_batches inventory_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);


--
-- Name: inventory_batches inventory_batches_sale_return_item_relation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_sale_return_item_relation_unique UNIQUE (tenant_id, store_id, sale_return_item_id, variant_id);


--
-- Name: inventory_batches inventory_batches_sale_return_item_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_sale_return_item_unique UNIQUE (sale_return_item_id);


--
-- Name: inventory_batches inventory_batches_tenant_barcode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_tenant_barcode_unique UNIQUE (tenant_id, barcode);


--
-- Name: membership_store_access membership_store_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_store_access
    ADD CONSTRAINT membership_store_access_pkey PRIMARY KEY (id);


--
-- Name: membership_store_access membership_store_access_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_store_access
    ADD CONSTRAINT membership_store_access_unique UNIQUE (membership_id, store_id);


--
-- Name: payment_accounts payment_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_pkey PRIMARY KEY (id);


--
-- Name: payment_accounts payment_accounts_tenant_store_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_tenant_store_code_unique UNIQUE (tenant_id, store_id, code);


--
-- Name: payment_accounts payment_accounts_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_tenant_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_tenant_code_unique UNIQUE (tenant_id, code);


--
-- Name: payment_methods payment_methods_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: platform_admins platform_admins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_email_key UNIQUE (email);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: purchase_items purchase_items_batch_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_batch_target_unique UNIQUE (tenant_id, store_id, id, variant_id);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_return_items purchase_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, area);


--
-- Name: roles roles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_unique UNIQUE (tenant_id, name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: sale_item_batches sale_item_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item_batches
    ADD CONSTRAINT sale_item_batches_pkey PRIMARY KEY (id);


--
-- Name: sale_item_batches sale_item_batches_return_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item_batches
    ADD CONSTRAINT sale_item_batches_return_target_unique UNIQUE (tenant_id, store_id, id, sale_item_id, variant_id);


--
-- Name: sale_items sale_items_batch_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_batch_target_unique UNIQUE (tenant_id, store_id, id, variant_id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sale_payments sale_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_pkey PRIMARY KEY (id);


--
-- Name: sale_payments sale_payments_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: sale_return_items sale_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_pkey PRIMARY KEY (id);


--
-- Name: sale_return_items sale_return_items_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_target_unique UNIQUE (tenant_id, store_id, id, variant_id);


--
-- Name: sale_returns sale_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_pkey PRIMARY KEY (id);


--
-- Name: sale_returns sale_returns_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: sales sales_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: sellables sellables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellables
    ADD CONSTRAINT sellables_pkey PRIMARY KEY (id);


--
-- Name: sellables sellables_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellables
    ADD CONSTRAINT sellables_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: sellables sellables_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellables
    ADD CONSTRAINT sellables_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: stores stores_tenant_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_tenant_code_unique UNIQUE (tenant_id, code);


--
-- Name: stores stores_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: tenant_memberships tenant_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_pkey PRIMARY KEY (id);


--
-- Name: tenant_memberships tenant_memberships_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: variants variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_pkey PRIMARY KEY (id);


--
-- Name: variants variants_tenant_id_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_tenant_id_id_unique UNIQUE (tenant_id, id);


--
-- Name: variants variants_tenant_store_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_tenant_store_id_unique UNIQUE (tenant_id, store_id, id);


--
-- Name: idx_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_parent ON public.categories USING btree (tenant_id, store_id, parent_id);


--
-- Name: idx_categories_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_store ON public.categories USING btree (tenant_id, store_id);


--
-- Name: idx_categories_subcategory_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_categories_subcategory_name_unique ON public.categories USING btree (tenant_id, store_id, parent_id, name) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_categories_top_level_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_categories_top_level_name_unique ON public.categories USING btree (tenant_id, store_id, name) WHERE (parent_id IS NULL);


--
-- Name: idx_customer_credit_ledger_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_credit_ledger_customer ON public.customer_credit_ledger USING btree (tenant_id, customer_id, created_at);


--
-- Name: idx_customer_credit_ledger_reverses_entry_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_customer_credit_ledger_reverses_entry_unique ON public.customer_credit_ledger USING btree (reverses_entry_id) WHERE (reverses_entry_id IS NOT NULL);


--
-- Name: idx_customer_credit_ledger_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_credit_ledger_sale ON public.customer_credit_ledger USING btree (sale_id) WHERE (sale_id IS NOT NULL);


--
-- Name: idx_customer_credit_ledger_sale_payment_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_customer_credit_ledger_sale_payment_unique ON public.customer_credit_ledger USING btree (sale_payment_id) WHERE (sale_payment_id IS NOT NULL);


--
-- Name: idx_customers_tenant_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_tenant_email ON public.customers USING btree (tenant_id, email) WHERE (email IS NOT NULL);


--
-- Name: idx_customers_tenant_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_tenant_phone ON public.customers USING btree (tenant_id, phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_customers_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_tenant_status ON public.customers USING btree (tenant_id, status);


--
-- Name: idx_inventory_batches_purchase_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_purchase_item ON public.inventory_batches USING btree (tenant_id, purchase_item_id);


--
-- Name: idx_inventory_batches_store_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_store_variant ON public.inventory_batches USING btree (tenant_id, store_id, variant_id, received_at);


--
-- Name: idx_membership_store_access_membership; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_store_access_membership ON public.membership_store_access USING btree (tenant_id, membership_id);


--
-- Name: idx_membership_store_access_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membership_store_access_store ON public.membership_store_access USING btree (tenant_id, store_id);


--
-- Name: idx_payment_accounts_store_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_accounts_store_status ON public.payment_accounts USING btree (tenant_id, store_id, status);


--
-- Name: idx_payment_methods_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_methods_tenant_status ON public.payment_methods USING btree (tenant_id, status);


--
-- Name: idx_purchase_items_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_purchase ON public.purchase_items USING btree (purchase_id);


--
-- Name: idx_purchase_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_variant ON public.purchase_items USING btree (tenant_id, variant_id);


--
-- Name: idx_purchase_return_items_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_return_items_batch ON public.purchase_return_items USING btree (batch_id);


--
-- Name: idx_purchase_return_items_purchase_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_return_items_purchase_item ON public.purchase_return_items USING btree (purchase_item_id);


--
-- Name: idx_purchase_return_items_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_return_items_return ON public.purchase_return_items USING btree (purchase_return_id);


--
-- Name: idx_purchase_returns_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_returns_purchase ON public.purchase_returns USING btree (tenant_id, purchase_id);


--
-- Name: idx_purchase_returns_store_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_returns_store_date ON public.purchase_returns USING btree (tenant_id, store_id, return_date DESC);


--
-- Name: idx_purchases_store_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_store_date ON public.purchases USING btree (tenant_id, store_id, purchase_date DESC);


--
-- Name: idx_purchases_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_supplier ON public.purchases USING btree (tenant_id, supplier_id);


--
-- Name: idx_purchases_supplier_reference_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_purchases_supplier_reference_unique ON public.purchases USING btree (tenant_id, supplier_id, reference_number) WHERE ((reference_number IS NOT NULL) AND ((status)::text <> 'cancelled'::text));


--
-- Name: idx_role_permissions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_tenant_id ON public.role_permissions USING btree (tenant_id);


--
-- Name: idx_roles_one_owner_role; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_roles_one_owner_role ON public.roles USING btree (tenant_id) WHERE is_owner_role;


--
-- Name: idx_roles_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_tenant_id ON public.roles USING btree (tenant_id);


--
-- Name: idx_sale_item_batches_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_item_batches_batch ON public.sale_item_batches USING btree (tenant_id, store_id, batch_id);


--
-- Name: idx_sale_item_batches_sale_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_item_batches_sale_item ON public.sale_item_batches USING btree (sale_item_id);


--
-- Name: idx_sale_items_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_sale ON public.sale_items USING btree (sale_id);


--
-- Name: idx_sale_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_variant ON public.sale_items USING btree (tenant_id, variant_id);


--
-- Name: idx_sale_payments_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_payments_account ON public.sale_payments USING btree (tenant_id, payment_account_id) WHERE (payment_account_id IS NOT NULL);


--
-- Name: idx_sale_payments_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_payments_method ON public.sale_payments USING btree (tenant_id, payment_method_id);


--
-- Name: idx_sale_payments_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_payments_received_at ON public.sale_payments USING btree (tenant_id, store_id, received_at);


--
-- Name: idx_sale_payments_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_payments_sale ON public.sale_payments USING btree (sale_id);


--
-- Name: idx_sale_return_items_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_return_items_batch ON public.sale_return_items USING btree (tenant_id, store_id, sale_item_batch_id);


--
-- Name: idx_sale_return_items_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_return_items_return ON public.sale_return_items USING btree (sale_return_id);


--
-- Name: idx_sale_return_items_sale_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_return_items_sale_item ON public.sale_return_items USING btree (tenant_id, sale_item_id);


--
-- Name: idx_sale_returns_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_returns_sale ON public.sale_returns USING btree (tenant_id, sale_id);


--
-- Name: idx_sale_returns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_returns_status ON public.sale_returns USING btree (tenant_id, store_id, status);


--
-- Name: idx_sale_returns_store_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_returns_store_created ON public.sale_returns USING btree (tenant_id, store_id, created_at DESC);


--
-- Name: idx_sale_returns_tenant_store_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sale_returns_tenant_store_number_unique ON public.sale_returns USING btree (tenant_id, store_id, return_number) WHERE (return_number IS NOT NULL);


--
-- Name: idx_sales_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_customer ON public.sales USING btree (tenant_id, customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: idx_sales_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_status ON public.sales USING btree (tenant_id, store_id, status);


--
-- Name: idx_sales_store_sold_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_store_sold_at ON public.sales USING btree (tenant_id, store_id, sold_at DESC);


--
-- Name: idx_sales_tenant_store_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sales_tenant_store_number_unique ON public.sales USING btree (tenant_id, store_id, sale_number) WHERE (sale_number IS NOT NULL);


--
-- Name: idx_sellables_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sellables_category ON public.sellables USING btree (tenant_id, store_id, category_id);


--
-- Name: idx_sellables_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sellables_store ON public.sellables USING btree (tenant_id, store_id);


--
-- Name: idx_sellables_store_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sellables_store_status ON public.sellables USING btree (tenant_id, store_id, status);


--
-- Name: idx_stock_movements_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_batch ON public.stock_movements USING btree (tenant_id, store_id, batch_id, occurred_at);


--
-- Name: idx_stock_movements_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_occurred_at ON public.stock_movements USING btree (tenant_id, occurred_at);


--
-- Name: idx_stock_movements_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_reference ON public.stock_movements USING btree (tenant_id, reference_type, reference_id) WHERE (reference_id IS NOT NULL);


--
-- Name: idx_stock_movements_reversal_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_stock_movements_reversal_unique ON public.stock_movements USING btree (batch_id, movement_type, reference_type, reference_id) WHERE ((movement_type)::text = ANY ((ARRAY['SOLD_REVERSAL'::character varying, 'PURCHASE_RETURN_REVERSAL'::character varying])::text[]));


--
-- Name: idx_stock_movements_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_variant ON public.stock_movements USING btree (tenant_id, store_id, variant_id, occurred_at);


--
-- Name: idx_stores_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stores_status ON public.stores USING btree (status);


--
-- Name: idx_stores_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stores_tenant_id ON public.stores USING btree (tenant_id);


--
-- Name: idx_tenant_memberships_invite_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tenant_memberships_invite_unique ON public.tenant_memberships USING btree (tenant_id, invited_email) WHERE (user_id IS NULL);


--
-- Name: idx_tenant_memberships_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_memberships_role_id ON public.tenant_memberships USING btree (role_id);


--
-- Name: idx_tenant_memberships_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_memberships_tenant_id ON public.tenant_memberships USING btree (tenant_id);


--
-- Name: idx_tenant_memberships_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_memberships_user_id ON public.tenant_memberships USING btree (user_id);


--
-- Name: idx_tenant_memberships_user_tenant_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tenant_memberships_user_tenant_unique ON public.tenant_memberships USING btree (tenant_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_tenants_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_status ON public.tenants USING btree (status);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_variants_sellable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_sellable ON public.variants USING btree (tenant_id, sellable_id);


--
-- Name: idx_variants_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_store ON public.variants USING btree (tenant_id, store_id);


--
-- Name: idx_variants_store_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_store_status ON public.variants USING btree (tenant_id, store_id, status);


--
-- Name: idx_variants_tenant_sku_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_variants_tenant_sku_unique ON public.variants USING btree (tenant_id, sku) WHERE (sku IS NOT NULL);


--
-- Name: categories trg_categories_one_level_deep; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_categories_one_level_deep BEFORE INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.trg_fn_categories_one_level_deep();


--
-- Name: categories trg_categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customer_credit_ledger trg_customer_credit_ledger_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_credit_ledger_append_only BEFORE DELETE OR UPDATE ON public.customer_credit_ledger FOR EACH ROW EXECUTE FUNCTION public.customer_credit_ledger_reject_change();


--
-- Name: customer_credit_ledger trg_customer_credit_ledger_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_credit_ledger_validate BEFORE INSERT ON public.customer_credit_ledger FOR EACH ROW EXECUTE FUNCTION public.customer_credit_ledger_validate();


--
-- Name: customers trg_customers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_batches trg_inventory_batches_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_inventory_batches_insert_guard AFTER INSERT ON public.inventory_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_inventory_batches_insert_guard();


--
-- Name: inventory_batches trg_inventory_batches_prevent_core_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventory_batches_prevent_core_change BEFORE UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.inventory_batches_prevent_core_change();


--
-- Name: inventory_batches trg_inventory_batches_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventory_batches_set_updated_at BEFORE UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payment_accounts trg_payment_accounts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_accounts_set_updated_at BEFORE UPDATE ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payment_methods trg_payment_methods_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_methods_set_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: platform_admins trg_platform_admins_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_platform_admins_set_updated_at BEFORE UPDATE ON public.platform_admins FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchase_items trg_purchase_items_prevent_parent_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_items_prevent_parent_change BEFORE UPDATE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.purchase_items_prevent_parent_change();


--
-- Name: purchase_items trg_purchase_items_require_open_purchase; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_items_require_open_purchase BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.purchase_items_require_open_purchase();


--
-- Name: purchase_items trg_purchase_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_items_set_updated_at BEFORE UPDATE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchase_items trg_purchase_items_totals_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_purchase_items_totals_guard AFTER INSERT OR DELETE OR UPDATE ON public.purchase_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_purchase_totals_guard();


--
-- Name: purchase_items trg_purchase_items_validate_variant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_items_validate_variant BEFORE INSERT OR UPDATE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.purchase_items_validate_variant();


--
-- Name: purchase_return_items trg_purchase_return_items_prevent_identity_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_return_items_prevent_identity_change BEFORE UPDATE ON public.purchase_return_items FOR EACH ROW EXECUTE FUNCTION public.purchase_return_items_prevent_identity_change();


--
-- Name: purchase_return_items trg_purchase_return_items_require_draft_return; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_return_items_require_draft_return BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_return_items FOR EACH ROW EXECUTE FUNCTION public.purchase_return_items_require_draft_return();


--
-- Name: purchase_return_items trg_purchase_return_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_return_items_set_updated_at BEFORE UPDATE ON public.purchase_return_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchase_return_items trg_purchase_return_items_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_return_items_validate BEFORE INSERT OR UPDATE ON public.purchase_return_items FOR EACH ROW EXECUTE FUNCTION public.purchase_return_items_validate();


--
-- Name: purchase_returns trg_purchase_returns_completion_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_purchase_returns_completion_guard AFTER UPDATE ON public.purchase_returns DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_purchase_returns_completion_guard();


--
-- Name: purchase_returns trg_purchase_returns_guard_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_returns_guard_update BEFORE UPDATE ON public.purchase_returns FOR EACH ROW EXECUTE FUNCTION public.purchase_returns_guard_update();


--
-- Name: purchase_returns trg_purchase_returns_require_received_purchase; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_returns_require_received_purchase BEFORE INSERT ON public.purchase_returns FOR EACH ROW EXECUTE FUNCTION public.purchase_returns_require_received_purchase();


--
-- Name: purchase_returns trg_purchase_returns_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_returns_set_updated_at BEFORE UPDATE ON public.purchase_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchases trg_purchases_guard_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchases_guard_update BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.purchases_guard_update();


--
-- Name: purchases trg_purchases_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchases_set_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchases trg_purchases_totals_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_purchases_totals_guard AFTER INSERT OR UPDATE ON public.purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_purchase_totals_guard();


--
-- Name: role_permissions trg_role_permissions_protect_owner_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_role_permissions_protect_owner_role BEFORE INSERT OR DELETE OR UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.trg_fn_role_permissions_protect_owner_role();


--
-- Name: roles trg_roles_protect_owner_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_protect_owner_role BEFORE DELETE OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.trg_fn_roles_protect_owner_role();


--
-- Name: roles trg_roles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_item_batches trg_sale_item_batches_allocation_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_sale_item_batches_allocation_guard AFTER INSERT OR DELETE OR UPDATE ON public.sale_item_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sale_item_batches_allocation_guard();


--
-- Name: sale_item_batches trg_sale_item_batches_prevent_identity_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_item_batches_prevent_identity_change BEFORE UPDATE ON public.sale_item_batches FOR EACH ROW EXECUTE FUNCTION public.sale_item_batches_prevent_identity_change();


--
-- Name: sale_item_batches trg_sale_item_batches_require_draft_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_item_batches_require_draft_sale BEFORE INSERT OR DELETE OR UPDATE ON public.sale_item_batches FOR EACH ROW EXECUTE FUNCTION public.sale_item_batches_require_draft_sale();


--
-- Name: sale_item_batches trg_sale_item_batches_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_item_batches_set_updated_at BEFORE UPDATE ON public.sale_item_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_items trg_sale_items_prevent_parent_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_items_prevent_parent_change BEFORE UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.sale_items_prevent_parent_change();


--
-- Name: sale_items trg_sale_items_require_active_variant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_items_require_active_variant BEFORE INSERT OR UPDATE OF variant_id ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.sale_items_require_active_variant();


--
-- Name: sale_items trg_sale_items_require_draft_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_items_require_draft_sale BEFORE INSERT OR DELETE OR UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.sale_items_require_draft_sale();


--
-- Name: sale_items trg_sale_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_items_set_updated_at BEFORE UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_items trg_sale_items_totals_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_sale_items_totals_guard AFTER INSERT OR DELETE OR UPDATE ON public.sale_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sale_totals_guard();


--
-- Name: sale_items trg_sale_items_validate_variant_store; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_items_validate_variant_store BEFORE INSERT OR UPDATE OF variant_id ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.sale_items_validate_variant_store();


--
-- Name: sale_payments trg_sale_payments_prevent_identity_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_payments_prevent_identity_change BEFORE UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.sale_payments_prevent_identity_change();


--
-- Name: sale_payments trg_sale_payments_require_draft_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_payments_require_draft_sale BEFORE INSERT OR DELETE OR UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.sale_payments_require_draft_sale();


--
-- Name: sale_payments trg_sale_payments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_payments_set_updated_at BEFORE UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_payments trg_sale_payments_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_payments_validate BEFORE INSERT OR UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.sale_payments_validate();


--
-- Name: sale_return_items trg_sale_return_items_prevent_identity_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_return_items_prevent_identity_change BEFORE UPDATE ON public.sale_return_items FOR EACH ROW EXECUTE FUNCTION public.sale_return_items_prevent_identity_change();


--
-- Name: sale_return_items trg_sale_return_items_require_draft_return; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_return_items_require_draft_return BEFORE INSERT OR DELETE OR UPDATE ON public.sale_return_items FOR EACH ROW EXECUTE FUNCTION public.sale_return_items_require_draft_return();


--
-- Name: sale_return_items trg_sale_return_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_return_items_set_updated_at BEFORE UPDATE ON public.sale_return_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_returns trg_sale_returns_completion_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_sale_returns_completion_guard AFTER UPDATE ON public.sale_returns DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sale_returns_completion_guard();


--
-- Name: sale_returns trg_sale_returns_guard_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_returns_guard_update BEFORE UPDATE ON public.sale_returns FOR EACH ROW EXECUTE FUNCTION public.sale_returns_guard_update();


--
-- Name: sale_returns trg_sale_returns_require_completed_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_returns_require_completed_sale BEFORE INSERT ON public.sale_returns FOR EACH ROW EXECUTE FUNCTION public.sale_returns_require_completed_sale();


--
-- Name: sale_returns trg_sale_returns_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_returns_set_updated_at BEFORE UPDATE ON public.sale_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sales trg_sales_completion_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_sales_completion_guard AFTER UPDATE ON public.sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sales_completion_guard();


--
-- Name: sales trg_sales_guard_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sales_guard_update BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.sales_guard_update();


--
-- Name: sales trg_sales_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sales_set_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sales trg_sales_totals_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_sales_totals_guard AFTER INSERT OR UPDATE ON public.sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sale_totals_guard();


--
-- Name: sellables trg_sellables_prevent_identity_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sellables_prevent_identity_change BEFORE UPDATE ON public.sellables FOR EACH ROW EXECUTE FUNCTION public.sellables_prevent_identity_change();


--
-- Name: sellables trg_sellables_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sellables_set_updated_at BEFORE UPDATE ON public.sellables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_movements trg_stock_movements_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_movements_append_only BEFORE DELETE OR UPDATE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.stock_movements_reject_change();


--
-- Name: stock_movements trg_stock_movements_apply_to_batch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_movements_apply_to_batch AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.trg_fn_stock_movements_apply_to_batch();


--
-- Name: stores trg_stores_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stores_set_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: suppliers trg_suppliers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tenant_memberships trg_tenant_memberships_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_tenant_memberships_owner_guard AFTER INSERT OR DELETE OR UPDATE ON public.tenant_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tenant_memberships_owner_guard();


--
-- Name: tenant_memberships trg_tenant_memberships_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_memberships_set_updated_at BEFORE UPDATE ON public.tenant_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tenants trg_tenants_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_tenants_owner_guard AFTER INSERT OR UPDATE ON public.tenants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tenants_owner_guard();


--
-- Name: tenants trg_tenants_prevent_slug_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenants_prevent_slug_change BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.tenants_prevent_slug_change();


--
-- Name: tenants trg_tenants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenants_set_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: variants trg_variants_prevent_parent_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_variants_prevent_parent_change BEFORE UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION public.variants_prevent_parent_change();


--
-- Name: variants trg_variants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_variants_set_updated_at BEFORE UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: categories categories_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_fk FOREIGN KEY (tenant_id, store_id, parent_id) REFERENCES public.categories(tenant_id, store_id, id) ON DELETE CASCADE;


--
-- Name: categories categories_store_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id);


--
-- Name: categories categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: customer_credit_ledger customer_credit_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: customer_credit_ledger customer_credit_ledger_customer_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_customer_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id);


--
-- Name: customer_credit_ledger customer_credit_ledger_reverses_entry_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_reverses_entry_fk FOREIGN KEY (tenant_id, reverses_entry_id) REFERENCES public.customer_credit_ledger(tenant_id, id);


--
-- Name: customer_credit_ledger customer_credit_ledger_sale_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_sale_fk FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES public.sales(tenant_id, store_id, id);


--
-- Name: customer_credit_ledger customer_credit_ledger_sale_payment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_sale_payment_fk FOREIGN KEY (tenant_id, sale_payment_id) REFERENCES public.sale_payments(tenant_id, id);


--
-- Name: customer_credit_ledger customer_credit_ledger_store_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id);


--
-- Name: customer_credit_ledger customer_credit_ledger_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: customers customers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory_batches inventory_batches_purchase_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_purchase_item_fk FOREIGN KEY (tenant_id, store_id, purchase_item_id, variant_id) REFERENCES public.purchase_items(tenant_id, store_id, id, variant_id);


--
-- Name: inventory_batches inventory_batches_sale_return_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_sale_return_item_fk FOREIGN KEY (tenant_id, store_id, sale_return_item_id, variant_id) REFERENCES public.sale_return_items(tenant_id, store_id, id, variant_id);


--
-- Name: inventory_batches inventory_batches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory_batches inventory_batches_variant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_variant_fk FOREIGN KEY (tenant_id, store_id, variant_id) REFERENCES public.variants(tenant_id, store_id, id);


--
-- Name: membership_store_access membership_store_access_membership_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_store_access
    ADD CONSTRAINT membership_store_access_membership_fk FOREIGN KEY (tenant_id, membership_id) REFERENCES public.tenant_memberships(tenant_id, id);


--
-- Name: membership_store_access membership_store_access_store_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_store_access
    ADD CONSTRAINT membership_store_access_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id);


--
-- Name: membership_store_access membership_store_access_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_store_access
    ADD CONSTRAINT membership_store_access_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payment_accounts payment_accounts_store_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id);


--
-- Name: payment_accounts payment_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payment_methods payment_methods_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: purchase_items purchase_items_purchase_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_purchase_fk FOREIGN KEY (tenant_id, store_id, purchase_id) REFERENCES public.purchases(tenant_id, store_id, id);


--
-- Name: purchase_items purchase_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: purchase_items purchase_items_variant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_variant_fk FOREIGN KEY (tenant_id, variant_id) REFERENCES public.variants(tenant_id, id);


--
-- Name: purchase_return_items purchase_return_items_batch_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_batch_fk FOREIGN KEY (tenant_id, store_id, batch_id, variant_id) REFERENCES public.inventory_batches(tenant_id, store_id, id, variant_id);


--
-- Name: purchase_return_items purchase_return_items_purchase_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_purchase_item_fk FOREIGN KEY (tenant_id, store_id, purchase_item_id, variant_id) REFERENCES public.purchase_items(tenant_id, store_id, id, variant_id);


--
-- Name: purchase_return_items purchase_return_items_return_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_return_fk FOREIGN KEY (tenant_id, store_id, purchase_return_id) REFERENCES public.purchase_returns(tenant_id, store_id, id);


--
-- Name: purchase_return_items purchase_return_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: purchase_returns purchase_returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: purchase_returns purchase_returns_purchase_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_purchase_fk FOREIGN KEY (tenant_id, store_id, purchase_id) REFERENCES public.purchases(tenant_id, store_id, id);


--
-- Name: purchase_returns purchase_returns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: purchases purchases_store_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id);


--
-- Name: purchases purchases_supplier_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES public.suppliers(tenant_id, id);


--
-- Name: purchases purchases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: role_permissions role_permissions_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_fk FOREIGN KEY (tenant_id, role_id) REFERENCES public.roles(tenant_id, id) ON DELETE CASCADE;


--
-- Name: roles roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sale_item_batches sale_item_batches_batch_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item_batches
    ADD CONSTRAINT sale_item_batches_batch_fk FOREIGN KEY (tenant_id, store_id, batch_id, variant_id) REFERENCES public.inventory_batches(tenant_id, store_id, id, variant_id);


--
-- Name: sale_item_batches sale_item_batches_sale_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item_batches
    ADD CONSTRAINT sale_item_batches_sale_item_fk FOREIGN KEY (tenant_id, store_id, sale_item_id, variant_id) REFERENCES public.sale_items(tenant_id, store_id, id, variant_id);


--
-- Name: sale_item_batches sale_item_batches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item_batches
    ADD CONSTRAINT sale_item_batches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sale_items sale_items_sale_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_fk FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES public.sales(tenant_id, store_id, id);


--
-- Name: sale_items sale_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sale_items sale_items_variant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_variant_fk FOREIGN KEY (tenant_id, variant_id) REFERENCES public.variants(tenant_id, id);


--
-- Name: sale_payments sale_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: sale_payments sale_payments_payment_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_payment_account_fk FOREIGN KEY (tenant_id, store_id, payment_account_id) REFERENCES public.payment_accounts(tenant_id, store_id, id);


--
-- Name: sale_payments sale_payments_payment_method_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_payment_method_fk FOREIGN KEY (tenant_id, payment_method_id) REFERENCES public.payment_methods(tenant_id, id);


--
-- Name: sale_payments sale_payments_sale_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_sale_fk FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES public.sales(tenant_id, store_id, id);


--
-- Name: sale_payments sale_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sale_return_items sale_return_items_batch_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_batch_fk FOREIGN KEY (tenant_id, store_id, sale_item_batch_id, sale_item_id, variant_id) REFERENCES public.sale_item_batches(tenant_id, store_id, id, sale_item_id, variant_id);


--
-- Name: sale_return_items sale_return_items_return_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_return_fk FOREIGN KEY (tenant_id, store_id, sale_return_id) REFERENCES public.sale_returns(tenant_id, store_id, id);


--
-- Name: sale_return_items sale_return_items_sale_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_sale_item_fk FOREIGN KEY (tenant_id, store_id, sale_item_id, variant_id) REFERENCES public.sale_items(tenant_id, store_id, id, variant_id);


--
-- Name: sale_return_items sale_return_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sale_returns sale_returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: sale_returns sale_returns_sale_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_sale_fk FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES public.sales(tenant_id, store_id, id);


--
-- Name: sale_returns sale_returns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales sales_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: sales sales_customer_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id);


--
-- Name: sales sales_store_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id);


--
-- Name: sales sales_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sellables sellables_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellables
    ADD CONSTRAINT sellables_category_fk FOREIGN KEY (tenant_id, store_id, category_id) REFERENCES public.categories(tenant_id, store_id, id);


--
-- Name: sellables sellables_store_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellables
    ADD CONSTRAINT sellables_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id);


--
-- Name: sellables sellables_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellables
    ADD CONSTRAINT sellables_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: stock_movements stock_movements_batch_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_batch_fk FOREIGN KEY (tenant_id, store_id, batch_id, variant_id) REFERENCES public.inventory_batches(tenant_id, store_id, id, variant_id);


--
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: stock_movements stock_movements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: stores stores_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: suppliers suppliers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_memberships tenant_memberships_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_role_fk FOREIGN KEY (tenant_id, role_id) REFERENCES public.roles(tenant_id, id);


--
-- Name: tenant_memberships tenant_memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_memberships tenant_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: variants variants_sellable_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_sellable_fk FOREIGN KEY (tenant_id, store_id, sellable_id) REFERENCES public.sellables(tenant_id, store_id, id);


--
-- Name: variants variants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_credit_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_credit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: membership_store_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.membership_store_access ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_item_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_item_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: sellables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sellables ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: categories tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.categories USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: customer_credit_ledger tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.customer_credit_ledger USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: customers tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.customers USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: inventory_batches tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.inventory_batches USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: membership_store_access tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.membership_store_access USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: payment_accounts tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.payment_accounts USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: payment_methods tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.payment_methods USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: purchase_items tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.purchase_items USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: purchase_return_items tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.purchase_return_items USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: purchase_returns tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.purchase_returns USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: purchases tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.purchases USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: role_permissions tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.role_permissions USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: roles tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.roles USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: sale_item_batches tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sale_item_batches USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: sale_items tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sale_items USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: sale_payments tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sale_payments USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: sale_return_items tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sale_return_items USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: sale_returns tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sale_returns USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: sales tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sales USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: sellables tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sellables USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: stock_movements tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.stock_movements USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: stores tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.stores USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: suppliers tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.suppliers USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: tenant_memberships tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.tenant_memberships USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: variants tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.variants USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));


--
-- Name: users tenant_membership_or_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_membership_or_self ON public.users USING (((id = public.app_current_user_id()) OR (EXISTS ( SELECT 1
   FROM public.tenant_memberships tm
  WHERE ((tm.user_id = users.id) AND (tm.tenant_id = public.app_current_tenant_id()))))));


--
-- Name: tenant_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO app_role;


--
-- Name: FUNCTION add_tenant_user(p_tenant_id uuid, p_role_id uuid, p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_tenant_user(p_tenant_id uuid, p_role_id uuid, p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_tenant_user(p_tenant_id uuid, p_role_id uuid, p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying) TO app_role;


--
-- Name: FUNCTION find_login_credentials(p_email character varying); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_login_credentials(p_email character varying) TO app_role;


--
-- Name: FUNCTION platform_list_tenants(p_search character varying); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.platform_list_tenants(p_search character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_list_tenants(p_search character varying) TO app_role;


--
-- Name: FUNCTION provision_new_account(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_tenant_name character varying, p_tenant_slug character varying, p_store_name character varying, p_store_code character varying); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.provision_new_account(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_tenant_name character varying, p_tenant_slug character varying, p_store_name character varying, p_store_code character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.provision_new_account(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_tenant_name character varying, p_tenant_slug character varying, p_store_name character varying, p_store_code character varying) TO app_role;


--
-- Name: TABLE stock_movements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.stock_movements TO app_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.categories TO app_role;


--
-- Name: TABLE customer_credit_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.customer_credit_ledger TO app_role;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.customers TO app_role;


--
-- Name: TABLE inventory_batches; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.inventory_batches TO app_role;


--
-- Name: TABLE membership_store_access; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.membership_store_access TO app_role;


--
-- Name: TABLE payment_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.payment_accounts TO app_role;


--
-- Name: TABLE payment_methods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.payment_methods TO app_role;


--
-- Name: TABLE platform_admins; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.platform_admins TO app_role;


--
-- Name: TABLE purchase_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.purchase_items TO app_role;


--
-- Name: TABLE purchase_return_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.purchase_return_items TO app_role;


--
-- Name: TABLE purchase_returns; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.purchase_returns TO app_role;


--
-- Name: TABLE purchases; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.purchases TO app_role;


--
-- Name: TABLE role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.role_permissions TO app_role;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.roles TO app_role;


--
-- Name: TABLE sale_item_batches; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sale_item_batches TO app_role;


--
-- Name: TABLE sale_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sale_items TO app_role;


--
-- Name: TABLE sale_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sale_payments TO app_role;


--
-- Name: TABLE sale_return_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sale_return_items TO app_role;


--
-- Name: TABLE sale_returns; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.sale_returns TO app_role;


--
-- Name: TABLE sales; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.sales TO app_role;


--
-- Name: TABLE sellables; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.sellables TO app_role;


--
-- Name: TABLE stores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.stores TO app_role;


--
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.suppliers TO app_role;


--
-- Name: TABLE tenant_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.tenant_memberships TO app_role;


--
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.tenants TO app_role;


--
-- Name: COLUMN tenants.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.tenants TO app_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.users TO app_role;


--
-- Name: TABLE variants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.variants TO app_role;


--
-- PostgreSQL database dump complete
--

\unrestrict lrROXkXEJd1dncRNEFwDpA7C3Cf422Sf1QeaE4fJpeCpSJiY4LJS3sRESH8r7aS

