"use client";

import { themes, useTheme, type ThemeName } from "@zenzoo/design-tokens";
import { Icon, textStyle, useThemePreference, type ThemePreference } from "@zenzoo/ui-web";
import PageHeader from "./PageHeader";

const OPTIONS: { value: ThemePreference; name: string; description: string }[] = [
  { value: "system", name: "System", description: "Match this device, and switch with it." },
  { value: "light", name: "Light", description: "Bright surfaces with dark text." },
  { value: "dark", name: "Dark", description: "Dark surfaces, easier in low light." },
];

/** A small drawing of a screen in one theme, drawn with that theme's own colours. */
function Preview({ name }: { name: ThemeName }) {
  const { radius, spacing } = useTheme();
  const colors = themes[name].colors;
  return (
    <div
      aria-hidden="true"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: spacing[2],
        padding: spacing[3],
        backgroundColor: colors.surfaceCanvas,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing[2],
          padding: spacing[3],
          borderRadius: radius.md,
          backgroundColor: colors.surfaceRaised,
        }}
      >
        <span
          style={{
            height: 6,
            width: "55%",
            borderRadius: radius.full,
            backgroundColor: colors.ink,
          }}
        />
        <span
          style={{
            height: 6,
            width: "80%",
            borderRadius: radius.full,
            backgroundColor: colors.inkFaint,
          }}
        />
        <span
          style={{
            height: 14,
            width: "100%",
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceSunken,
          }}
        />
        <span
          style={{
            height: 14,
            width: "45%",
            borderRadius: radius.full,
            backgroundColor: colors.accent,
          }}
        />
      </div>
    </div>
  );
}

/** Light, dark, or follow the device. The choice is remembered on this browser. */
export default function ThemeSettings() {
  const { colors, radius, spacing } = useTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Theme"
        subtitle="Choose how ZenZoo looks."
        backHref="/settings"
        backLabel="Back to settings"
      />

      <div
        role="radiogroup"
        aria-label="Theme"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: spacing[6],
        }}
      >
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(option.value)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: spacing[5],
                padding: spacing[5],
                border: `1px solid ${selected ? colors.accent : colors.border}`,
                borderRadius: radius.lg,
                backgroundColor: "transparent",
                color: colors.ink,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  height: 120,
                  borderRadius: radius.md,
                  overflow: "hidden",
                }}
              >
                {option.value === "system" ? (
                  <>
                    <Preview name="light" />
                    <Preview name="dark" />
                  </>
                ) : (
                  <Preview name={option.value} />
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing[3],
                }}
              >
                <div>
                  <div style={{ ...textStyle("headline"), color: colors.ink }}>{option.name}</div>
                  <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    {option.description}
                  </div>
                </div>
                {selected ? (
                  <span style={{ color: colors.accent, display: "inline-flex" }}>
                    <Icon name="check" size={20} />
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
