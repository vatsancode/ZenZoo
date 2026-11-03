"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { LoadError, Skeleton } from "@zenzoo/ui-web";
import PageHeader from "./PageHeader";
import { StatRow } from "./StatTile";

/**
 * What a detail page (a vendor, a customer, a purchase) shows before its record arrives: the
 * header and back button where the real ones will be, then placeholders in the page's shape -
 * or, when loading failed, why, with Try again.
 */
export default function DetailPageLoading({
  backHref,
  backLabel,
  failed = false,
  failedTitle,
  failedMessage,
  onRetry,
  retrying = false,
}: {
  backHref: string;
  backLabel: string;
  failed?: boolean;
  /** The header's title once loading has failed, e.g. "Vendor". */
  failedTitle: string;
  /** e.g. "Couldn't load this vendor." */
  failedMessage: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { spacing } = useTheme();
  const tile = spacing[16] + spacing[8];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title={failed ? failedTitle : <Skeleton text="title1" width="40%" />}
        subtitle={failed ? undefined : <Skeleton text="callout" width="20%" />}
        backHref={backHref}
        backLabel={backLabel}
      />
      {failed ? (
        <LoadError message={failedMessage} onRetry={onRetry} retrying={retrying} />
      ) : (
        <>
          <StatRow>
            <Skeleton variant="block" height={tile} />
            <Skeleton variant="block" height={tile} />
            <Skeleton variant="block" height={tile} />
          </StatRow>
          <Skeleton variant="block" height={spacing[16] * 3} />
        </>
      )}
    </div>
  );
}
