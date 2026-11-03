"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, LoadError, Notice, Switch, textStyle } from "@zenzoo/ui-web";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAccess } from "../../lib/access";
import { useSingleFlight } from "../../lib/useSingleFlight";
import {
  editVendor,
  getVendor,
  lastSeenVendor,
  listVendors,
  setVendorStatus,
  type Vendor,
  type VendorInput,
} from "./vendors";
import DetailPageLoading from "../../components/DetailPageLoading";
import PageHeader from "../../components/PageHeader";
import StatTile, { StatRow } from "../../components/StatTile";
import VendorSheet from "./VendorSheet";

export default function VendorDetail({ vendorId }: { vendorId: string }) {
  const { colors, spacing } = useTheme();
  // undefined while loading, null when there is no such vendor. Opened from the list, it starts
  // from the copy the list already has, so the page shows at once while the fresh copy loads.
  const [vendor, setVendor] = useState<Vendor | null | undefined>(() => lastSeenVendor(vendorId));
  // Every vendor, so editing here warns about a repeated name or GSTIN just as the list does.
  // Only fetched once Edit is opened - just looking at a vendor needs nothing but that vendor.
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const canEdit = useAccess().can("vendors", "edit");
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { busy: loading, run: runLoad } = useSingleFlight();
  // One archive / reactivate at a time; the switch shows it is busy until the answer comes back.
  const { busy: archiving, run: runArchive } = useSingleFlight();

  const load = useCallback(
    () =>
      runLoad(async () => {
        setLoadFailed(false);
        try {
          setVendor(await getVendor(vendorId));
        } catch {
          setLoadFailed(true);
        }
      }),
    [runLoad, vendorId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editOpen) return;
    // The warnings are a convenience - the server still refuses a repeated GSTIN without them.
    listVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
  }, [editOpen]);

  async function handleSubmit(input: VendorInput): Promise<string | null> {
    if (!vendor) return null;
    const result = await editVendor(vendor.id, input);
    // Refused: the sheet stays open and shows why.
    if (typeof result === "string") return result;
    setVendor(result);
    setVendors((all) => all.map((item) => (item.id === result.id ? result : item)));
    setEditOpen(false);
    return null;
  }

  function toggleArchived(archived: boolean) {
    return runArchive(async () => {
      if (!vendor) return;
      const result = await setVendorStatus(vendor.id, archived);
      if (typeof result === "string") {
        setNotice(result);
        return;
      }
      setNotice(null);
      setVendor(result);
    });
  }

  if (vendor === undefined) {
    return (
      <DetailPageLoading
        backHref="/vendors"
        backLabel="Back to vendors"
        failed={loadFailed}
        failedTitle="Vendor"
        failedMessage="Couldn't load this vendor."
        onRetry={() => void load()}
        retrying={loading}
      />
    );
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
          canEdit ? (
            <Button variant="primary" onClick={() => setEditOpen(true)}>
              Edit vendor
            </Button>
          ) : undefined
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      {/* Showing the list's copy, but the fresh one didn't come. */}
      {loadFailed ? (
        <LoadError
          message="Couldn't refresh this vendor."
          onRetry={() => void load()}
          retrying={loading}
        />
      ) : null}

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
          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
            {archiving ? (
              <span role="status" style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                Saving...
              </span>
            ) : null}
            <Badge tone={vendor.status === "active" ? "success" : "neutral"}>
              {vendor.status === "active" ? "Active" : "Archived"}
            </Badge>
            {canEdit ? (
              <Switch
                checked={vendor.status === "active"}
                disabled={archiving}
                aria-busy={archiving || undefined}
                aria-label={
                  vendor.status === "active"
                    ? `Archive ${vendor.name}`
                    : `Reactivate ${vendor.name}`
                }
                onChange={(on) => void toggleArchived(!on)}
              />
            ) : null}
          </div>
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
        existing={vendors}
        onClose={() => setEditOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
