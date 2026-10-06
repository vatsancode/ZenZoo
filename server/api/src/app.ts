import cors from "cors";
import express, { type Express } from "express";
import { requirePlatformAdmin } from "./auth/platform-admin";
import { signIn } from "./auth/signIn";
import { SESSION_COOKIE_NAME } from "./auth/session";
import { listTenants } from "./modules/platform/listTenants";
import { provisionTenant, type ProvisionTenantInput } from "./modules/platform/provisionTenant";

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

  return app;
}
