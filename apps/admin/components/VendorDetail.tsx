"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState, type ReactNode } from "react";
import {
  editVendor,
  getVendor,
  listVendors,
  saveVendors,
  type Vendor,
  type VendorInput,
} from "../lib/vendors";
import PageHeader from "./PageHeader";
import StatTile, { StatRow } from "./StatTile";
import VendorSheet from "./VendorSheet";

export default function VendorDetail({ vendorId }: { vendorId: string }) {
  const { colors, spacing } = useTheme();
  // undefined while loading, null when there is no such vendor.
  const [vendor, setVendor] = useState<Vendor | null | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    getVendor(vendorId).then(setVendor);
  }, [vendorId]);

  function handleSubmit(input: VendorInput) {
    if (!vendor) return;
    listVendors().then((all) => {
      const next = editVendor(all, vendor.id, input);
      saveVendors(next);
      setVendor(next.find((item) => item.id === vendor.id) ?? null);
    });
    setEditOpen(false);
  }

  if (vendor === undefined) {
    return <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading vendor...</div>;
  }

  if (vendor === null) {
    return (
      <>
        <PageHeader title="Vendor not found" backHref="/vendors" backLabel="Back to vendors" />
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          This vendor doesn&apos;t exist, or was added in a session that has since reloaded.
        </div>
      </>
    );
  }

  const facts: { label: string; value: ReactNode }[] = [
    { label: "Phone", value: vendor.phone ?? "-" },
    { label: "Email", value: vendor.email ?? "-" },
    { label: "GSTIN", value: vendor.taxId ?? "-" },
    {
      label: "Location",
      value: vendor.mapUrl ? (
        <a
          href={vendor.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.ink }}
        >
          Open in Google Maps
        </a>
      ) : (
        "-"
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title={vendor.name}
        subtitle={vendor.status === "active" ? "Active vendor" : "Archived vendor"}
        backHref="/vendors"
        backLabel="Back to vendors"
        action={
          <Button variant="primary" onClick={() => setEditOpen(true)}>
            Edit vendor
          </Button>
        }
      />

      {/* No purchases exist yet, so these stay empty until that data does. */}
      <StatRow>
        <StatTile label="Total purchases" value="-" hint="No purchases yet" />
        <StatTile label="Amount spent" value="-" hint="No purchases yet" />
        <StatTile label="Last purchase" value="-" hint="No purchases yet" />
      </StatRow>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing[6],
          }}
        >
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Vendor details</div>
          <Badge tone={vendor.status === "active" ? "success" : "neutral"}>
            {vendor.status === "active" ? "Active" : "Archived"}
          </Badge>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            columnGap: spacing[6],
            rowGap: spacing[6],
          }}
        >
          {facts.map((fact) => (
            <div key={fact.label} style={{ minWidth: 0 }}>
              <div
                style={{
                  ...textStyle("caption"),
                  color: colors.inkMuted,
                  textTransform: "uppercase",
                }}
              >
                {fact.label}
              </div>
              <div style={{ ...textStyle("body"), color: colors.ink, marginTop: spacing[2] }}>
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <VendorSheet
        open={editOpen}
        vendor={vendor}
        onClose={() => setEditOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
