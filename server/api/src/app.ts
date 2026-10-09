import cors from "cors";
import express, { type Express, type Response } from "express";
import type { CapabilityResult } from "@zenzoo/types";
import { requirePlatformAdmin } from "./auth/platform-admin";
import { requireTenantUser } from "./auth/requireTenantUser";
import { getActor } from "./auth/actor";
import { signIn } from "./auth/signIn";
import { SESSION_COOKIE_NAME } from "./auth/session";
import { listTenants } from "./modules/platform/listTenants";
import { provisionTenant, type ProvisionTenantInput } from "./modules/platform/provisionTenant";
import { listRoles } from "./capabilities/reads/listRoles";
import { createRole } from "./capabilities/actions/createRole";
import { updateRole } from "./capabilities/actions/updateRole";
import { deleteRole } from "./capabilities/actions/deleteRole";
import { listUsers } from "./capabilities/reads/listUsers";
import { getCurrentUser } from "./modules/self/getCurrentUser";
import { listMyStores } from "./modules/self/listMyStores";
import { createUser } from "./capabilities/actions/createUser";
import { updateUser } from "./capabilities/actions/updateUser";
import { setUserStatus } from "./capabilities/actions/setUserStatus";
import { resetUserPassword } from "./capabilities/actions/resetUserPassword";
import { listCategories } from "./capabilities/reads/listCategories";
import { createCategory } from "./capabilities/actions/createCategory";
import { renameCategory } from "./capabilities/actions/renameCategory";
import { deleteCategory } from "./capabilities/actions/deleteCategory";
import { listProducts } from "./capabilities/reads/listProducts";
import { createProduct } from "./capabilities/actions/createProduct";
import { updateProduct } from "./capabilities/actions/updateProduct";
import { setProductStatus } from "./capabilities/actions/setProductStatus";
import { createVariant } from "./capabilities/actions/createVariant";
import { updateVariant } from "./capabilities/actions/updateVariant";
import { setVariantStatus } from "./capabilities/actions/setVariantStatus";
import { listSuppliers } from "./capabilities/reads/listSuppliers";
import { createSupplier } from "./capabilities/actions/createSupplier";
import { updateSupplier } from "./capabilities/actions/updateSupplier";
import { setSupplierStatus } from "./capabilities/actions/setSupplierStatus";

const CAPABILITY_FAILURE_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  PERMISSION_DENIED: 403,
  POLICY_VIOLATION: 409,
  CONFLICT: 409,
  INTERNAL_ERROR: 400,
};

/** Sends a capability's result as the route's response - 2xx with its data, or the matching status with { error: message } on failure. */
function sendCapabilityResult<T>(res: Response, result: CapabilityResult<T>, successStatus = 200): void {
  if (result.ok) {
    res.status(successStatus).json(result.data);
    return;
  }
  res.status(CAPABILITY_FAILURE_STATUS[result.error.code] ?? 400).json({ error: result.error.message });
}

const REQUIRED_FIELDS: (keyof ProvisionTenantInput)[] = [
  "ownerEmail",
  "ownerPassword",
  "ownerFirstName",
  "ownerLastName",
  "tenantName",
  "tenantSlug",
  "storeName",
  "storeCode",
];

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

export function createApp(): Express {
  const app = express();
  // credentials: true + an explicit origin (never "*") is required for the
  // browser to send/receive the session cookie across the admin app's
  // origin (port 3000) and this API's origin (port 4000) in dev.
  app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/auth/sign-in", async (req, res) => {
    const { email, password } = req.body as Partial<{ email: string; password: string }>;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const result = await signIn(email, password);
    if (!result) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    res.cookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({ kind: result.payload.kind });
  });

  app.post("/auth/sign-out", (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(204).end();
  });

  app.get("/platform-admin/tenants", requirePlatformAdmin, async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const tenants = await listTenants(search);
    res.json({ tenants });
  });

  app.post("/platform-admin/tenants", requirePlatformAdmin, async (req, res) => {
    const body = req.body as Partial<ProvisionTenantInput>;
    const missing = REQUIRED_FIELDS.filter((field) => !body[field]);
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
      return;
    }

    try {
      const result = await provisionTenant(body as ProvisionTenantInput);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/roles", requireTenantUser, async (req, res) => {
    const result = await listRoles.execute(getActor(req), undefined);
    sendCapabilityResult(res, result);
  });

  app.post("/roles", requireTenantUser, async (req, res) => {
    const result = await createRole.execute(getActor(req), req.body);
    sendCapabilityResult(res, result, 201);
  });

  app.put("/roles/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await updateRole.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.delete("/roles/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await deleteRole.execute(getActor(req), { id });
    sendCapabilityResult(res, result);
  });

  app.get("/me", requireTenantUser, async (req, res) => {
    const me = await getCurrentUser(getActor(req));
    res.json(me);
  });

  app.get("/stores", requireTenantUser, async (req, res) => {
    const stores = await listMyStores(getActor(req));
    res.json({ stores });
  });

  app.get("/categories", requireTenantUser, async (req, res) => {
    const storeId = req.query.storeId as string | undefined;
    if (!storeId) {
      res.status(400).json({ error: "storeId is required" });
      return;
    }
    const result = await listCategories.execute(getActor(req), { storeId });
    sendCapabilityResult(res, result);
  });

  app.post("/categories", requireTenantUser, async (req, res) => {
    const result = await createCategory.execute(getActor(req), req.body);
    sendCapabilityResult(res, result, 201);
  });

  app.put("/categories/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await renameCategory.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.delete("/categories/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await deleteCategory.execute(getActor(req), { id });
    sendCapabilityResult(res, result);
  });

  app.get("/products", requireTenantUser, async (req, res) => {
    const storeId = req.query.storeId as string | undefined;
    if (!storeId) {
      res.status(400).json({ error: "storeId is required" });
      return;
    }
    const result = await listProducts.execute(getActor(req), { storeId });
    sendCapabilityResult(res, result);
  });

  app.post("/products", requireTenantUser, async (req, res) => {
    const result = await createProduct.execute(getActor(req), req.body);
    sendCapabilityResult(res, result, 201);
  });

  app.put("/products/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await updateProduct.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.put("/products/:id/status", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await setProductStatus.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.post("/products/:id/variants", requireTenantUser, async (req, res) => {
    const sellableId = req.params.id as string;
    const result = await createVariant.execute(getActor(req), { ...req.body, sellableId });
    sendCapabilityResult(res, result, 201);
  });

  app.put("/variants/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await updateVariant.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.put("/variants/:id/status", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await setVariantStatus.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.get("/users", requireTenantUser, async (req, res) => {
    const result = await listUsers.execute(getActor(req), undefined);
    sendCapabilityResult(res, result);
  });

  app.post("/users", requireTenantUser, async (req, res) => {
    const result = await createUser.execute(getActor(req), req.body);
    sendCapabilityResult(res, result, 201);
  });

  app.put("/users/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await updateUser.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.put("/users/:id/status", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await setUserStatus.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.post("/users/:id/reset-password", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await resetUserPassword.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.get("/suppliers", requireTenantUser, async (req, res) => {
    const result = await listSuppliers.execute(getActor(req), undefined);
    sendCapabilityResult(res, result);
  });

  app.post("/suppliers", requireTenantUser, async (req, res) => {
    const result = await createSupplier.execute(getActor(req), req.body);
    sendCapabilityResult(res, result, 201);
  });

  app.put("/suppliers/:id", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await updateSupplier.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  app.put("/suppliers/:id/status", requireTenantUser, async (req, res) => {
    const id = req.params.id as string;
    const result = await setSupplierStatus.execute(getActor(req), { ...req.body, id });
    sendCapabilityResult(res, result);
  });

  return app;
}
