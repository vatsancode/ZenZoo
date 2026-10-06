import express, { type Express } from "express";
import { requirePlatformAdmin } from "./auth/platform-admin";
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

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
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
