"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface ConnectClaudeAnimationProps {
  /** The address shown being pasted into Claude. */
  address: string;
}

type Target = "zenzoo" | "name" | "url" | "continue";
type Touch = "idle" | "hover" | "down";
type ClickPhase = "idle" | "hover" | "down" | "up";

interface Frame {
  scene: "zenzoo" | "claude";
  dialogOpen?: boolean;
  /** The name is being typed, or has been. */
  name?: "typing" | "done";
  /** The address has been pasted. */
  pasted?: boolean;
  /** The "Paste here, Ctrl + V" hint is showing; `keys` means the keys are being pressed. */
  hint?: "paste" | "keys";
  /** Something the pointer clicks in this frame: it arrives, hovers, presses down, lets go. */
  click?: Target;
  /** The field with the text cursor in it. */
  focus?: "name" | "url";
  /** How long the frame stays, when not the default. */
  ms?: number;
  /** Where the pointer is, in canvas pixels. */
  cursor: { x: number; y: number };
  /** Which of the three dots is lit. */
  stage: number;
}

// The walkthrough: press the button in ZenZoo, Claude opens with the "Add custom connector" form
// already showing, fill in the name and address, continue.
const FRAMES: Frame[] = [
  { scene: "zenzoo", cursor: { x: 600, y: 470 }, stage: 0, ms: 800 },
  { scene: "zenzoo", cursor: { x: 392, y: 346 }, click: "zenzoo", stage: 0, ms: 1350 },
  { scene: "claude", dialogOpen: true, cursor: { x: 392, y: 346 }, stage: 1, ms: 1200 },
  {
    scene: "claude",
    dialogOpen: true,
    name: "typing",
    focus: "name",
    click: "name",
    cursor: { x: 300, y: 186 },
    stage: 2,
    ms: 2800,
  },
  {
    scene: "claude",
    dialogOpen: true,
    name: "done",
    hint: "paste",
    focus: "url",
    click: "url",
    cursor: { x: 300, y: 248 },
    stage: 2,
    ms: 2100,
  },
  {
    scene: "claude",
    dialogOpen: true,
    name: "done",
    pasted: true,
    hint: "keys",
    focus: "url",
    cursor: { x: 300, y: 248 },
    stage: 2,
    ms: 1500,
  },
  {
    scene: "claude",
    dialogOpen: true,
    name: "done",
    pasted: true,
    click: "continue",
    cursor: { x: 556, y: 416 },
    stage: 2,
    ms: 1350,
  },
  { scene: "claude", name: "done", pasted: true, cursor: { x: 556, y: 416 }, stage: 2, ms: 1200 },
];

const STAGES = [
  "Press the button in ZenZoo",
  "Claude opens the form",
  "Type the name, paste the address, then Continue",
];

const FRAME_MS = 1400;

/** What is typed into Claude's Name field. */
const NAME = "ZenZoo";

/** Size the picture is drawn at, then scaled to fit the dialog. */
const CANVAS = { width: 760, height: 540 };

// Claude's own look, as it appears in its settings. It keeps these colours in ZenZoo's dark mode
// too, because it is a picture of another app.
const C = {
  page: "#9b9a97",
  card: "#ffffff",
  ink: "#1f1e1d",
  muted: "#6f6e6b",
  faint: "#a3a29f",
  line: "#e9e7e2",
  pill: "#f0eee9",
  link: "#1c5fb8",
  linkLine: "#b6cdea",
  shadow: "0 8px 30px rgba(0,0,0,0.22)",
};
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type GlyphName =
  | "user"
  | "card"
  | "bars"
  | "palette"
  | "bell"
  | "shield"
  | "heart"
  | "shapes"
  | "code"
  | "monitor"
  | "search"
  | "filter"
  | "chevron"
  | "close"
  | "check"
  | "arrowUp";

const GLYPHS: Record<GlyphName, ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10h18" />
    </>
  ),
  bars: <path d="M6 20v-7M12 20V5M18 20v-10" />,
  palette: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="8.5" cy="11" r="1" />
      <circle cx="12" cy="8" r="1" />
      <circle cx="15.5" cy="11" r="1" />
    </>
  ),
  bell: <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4" />,
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
      <circle cx="12" cy="11" r="2" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z" />
  ),
  shapes: (
    <>
      <circle cx="9" cy="9" r="5" />
      <rect x="11" y="11" width="9" height="9" rx="2" />
    </>
  ),
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrowUp: <path d="M7 17L17 7M9 7h8v8" />,
};

function Glyph({
  name,
  size = 16,
  color = C.ink,
}: {
  name: GlyphName;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {GLYPHS[name]}
    </svg>
  );
}

const NAV_GROUPS: { label: string; icon: GlyphName; selected?: boolean }[][] = [
  [
    { label: "Account", icon: "user" },
    { label: "Billing", icon: "card" },
    { label: "Usage", icon: "bars" },
  ],
  [
    { label: "Appearance", icon: "palette" },
    { label: "Your Claude", icon: "user" },
    { label: "Capabilities", icon: "card" },
    { label: "Notifications", icon: "bell" },
    { label: "Privacy", icon: "shield" },
    { label: "Wellbeing", icon: "heart" },
  ],
  [
    { label: "Customize", icon: "shapes", selected: true },
    { label: "Code", icon: "code" },
  ],
  [{ label: "Desktop app", icon: "monitor" }],
];

const CONNECTORS: { name: string; mark: string; color: string; connected: boolean }[] = [
  { name: "Canva", mark: "C", color: "#7d2ae8", connected: true },
  { name: "Figma", mark: "F", color: "#f24e1e", connected: true },
  { name: "GitHub Integration", mark: "G", color: "#1f1e1d", connected: true },
  { name: "Gmail", mark: "M", color: "#d93025", connected: false },
  { name: "Google Calendar", mark: "31", color: "#1a73e8", connected: false },
  { name: "Google Drive", mark: "D", color: "#188038", connected: false },
];

/**
 * A small looping picture of the steps for adding ZenZoo to Claude, drawn to match Claude's
 * settings screens. It is drawn here rather than recorded, so it stays sharp and weighs nothing.
 */
export default function ConnectClaudeAnimation({ address }: ConnectClaudeAnimationProps) {
  const { colors, radius, spacing } = useTheme();
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [scale, setScale] = useState(0.86);
  const boxRef = useRef<HTMLDivElement>(null);
  const frame = FRAMES[index]!;

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setScale(box.clientWidth / CANVAS.width);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(
      () => setIndex((current) => (current + 1) % FRAMES.length),
      frame.ms ?? FRAME_MS,
    );
    return () => clearTimeout(timer);
  }, [reducedMotion, index, frame.ms]);

  // A click takes a moment: the pointer arrives and the target lights up under it (hover), the
  // button goes down, then lets go. What the click does shows in the next frame.
  const [clickState, setClickState] = useState<{ index: number; phase: ClickPhase }>({
    index: 0,
    phase: "idle",
  });
  const phase = clickState.index === index ? clickState.phase : "idle";
  useEffect(() => {
    if (!frame.click) return;
    if (reducedMotion) {
      setClickState({ index, phase: "up" });
      return;
    }
    const steps: [number, ClickPhase][] = [
      [750, "hover"],
      [1000, "down"],
      [1120, "up"],
    ];
    const timers = steps.map(([delay, next]) =>
      setTimeout(() => setClickState({ index, phase: next }), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [index, frame.click, reducedMotion]);

  /** How a target looks right now: untouched, under the pointer, or held down. */
  const touch = (target: Target): Touch => {
    if (frame.click !== target || phase === "idle") return "idle";
    return phase === "down" ? "down" : "hover";
  };
  const focused = (field: "name" | "url") =>
    frame.focus === field && (frame.click !== field || phase === "down" || phase === "up");

  // The name appears one letter at a time, once the field has been clicked.
  const [nameChars, setNameChars] = useState(0);
  useEffect(() => {
    if (frame.name === "done" || (frame.name === "typing" && reducedMotion)) {
      setNameChars(NAME.length);
      return;
    }
    setNameChars(0);
    if (frame.name !== "typing") return;
    let typer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      typer = setInterval(() => {
        setNameChars((current) => {
          if (current + 1 >= NAME.length && typer) clearInterval(typer);
          return Math.min(current + 1, NAME.length);
        });
      }, 140);
    }, 1150);
    return () => {
      clearTimeout(start);
      if (typer) clearInterval(typer);
    };
  }, [frame.name, reducedMotion]);

  const move = reducedMotion ? "none" : undefined;
  const fade = (visible: boolean): CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "none" : "translateY(4px)",
    transition: move ?? "opacity 250ms ease, transform 250ms ease",
    pointerEvents: "none",
  });
  const press = (state: Touch, amount = 0.96): CSSProperties => ({
    transform: state === "down" ? `scale(${amount})` : "none",
    transition: move ?? "transform 90ms ease-out, background-color 120ms ease",
  });

  const text = (size: number, extra: CSSProperties = {}): CSSProperties => ({
    margin: 0,
    fontFamily: FONT,
    fontSize: size,
    lineHeight: 1.35,
    color: C.ink,
    ...extra,
  });
  const pillButton = (dark: boolean, enabled = true, state: Touch = "idle"): CSSProperties => ({
    ...text(12.5, { fontWeight: 500 }),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 32,
    padding: "0 14px",
    borderRadius: 8,
    backgroundColor: dark
      ? enabled
        ? state === "down"
          ? "#000000"
          : state === "hover"
            ? "#3a3937"
            : C.ink
        : C.pill
      : C.pill,
    color: dark ? (enabled ? "#fff" : C.faint) : C.ink,
    transition: move ?? "background-color 200ms ease, color 200ms ease",
  });
  const input: CSSProperties = {
    ...text(13),
    display: "flex",
    alignItems: "center",
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    boxShadow: `inset 0 0 0 1px ${C.line}`,
    overflow: "hidden",
    whiteSpace: "nowrap",
  };
  const focusRing: CSSProperties = {
    boxShadow: "inset 0 0 0 1.5px #5a8fd8",
    transition: move ?? "box-shadow 120ms ease",
  };
  const link: CSSProperties = { color: C.link, boxShadow: `inset 0 -1px 0 ${C.linkLine}` };

  const typedName = (
    <span style={{ display: "block", width: "100%" }}>
      {nameChars === 0 && frame.name !== "typing" ? (
        <span style={{ color: C.faint }}>Name</span>
      ) : (
        <>
          {NAME.slice(0, nameChars)}
          {frame.name === "typing" && nameChars < NAME.length && (
            <span
              style={{
                display: "inline-block",
                width: 1,
                height: 15,
                marginLeft: 1,
                verticalAlign: "text-bottom",
                backgroundColor: C.ink,
              }}
            />
          )}
        </>
      )}
    </span>
  );

  const placeholderOrValue = (placeholder: string, value: string, shown: boolean) => (
    <span style={{ position: "relative", display: "block", width: "100%" }}>
      <span
        style={{
          color: C.faint,
          opacity: shown ? 0 : 1,
          transition: move ?? "opacity 200ms ease",
        }}
      >
        {placeholder}
      </span>
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          opacity: shown ? 1 : 0,
          transition: move ?? "opacity 200ms ease",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {value}
      </span>
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
      <div
        ref={boxRef}
        role="img"
        aria-label={`How to add ZenZoo to Claude. ${STAGES.join(". ")}.`}
        style={{
          position: "relative",
          width: "100%",
          height: CANVAS.height * scale,
          overflow: "hidden",
          borderRadius: radius.lg,
          backgroundColor: C.page,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: CANVAS.width,
            height: CANVAS.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* ZenZoo: the dialog and its button */}
          <div
            style={{
              ...fade(frame.scene === "zenzoo"),
              position: "absolute",
              inset: 0,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 190,
                top: 160,
                width: 380,
                height: 220,
                boxSizing: "border-box",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                backgroundColor: colors.surfaceRaised,
                borderRadius: radius.xl,
                boxShadow: C.shadow,
              }}
            >
              <p style={text(17, { fontWeight: 700, color: colors.ink })}>Connect Claude</p>
              <div
                style={{
                  ...text(12, {
                    color: colors.ink,
                    fontFamily: "ui-monospace, Consolas, monospace",
                  }),
                  padding: "11px 14px",
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSunken,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {address}
              </div>
              <div
                style={{
                  ...text(14, { fontWeight: 600, color: colors.onAccent }),
                  textAlign: "center",
                  padding: "11px 12px",
                  borderRadius: radius.full,
                  backgroundColor:
                    touch("zenzoo") === "idle"
                      ? colors.accent
                      : touch("zenzoo") === "hover"
                        ? `color-mix(in srgb, ${colors.accent} 88%, ${colors.ink})`
                        : colors.accentPressed,
                  ...press(touch("zenzoo"), 0.97),
                }}
              >
                Copy address and open Claude
              </div>
            </div>
          </div>

          {/* Claude: Settings, Connectors */}
          <div style={{ ...fade(frame.scene === "claude"), position: "absolute", inset: 0 }}>
            <div
              style={{
                position: "absolute",
                left: 12,
                top: 12,
                width: 736,
                height: 516,
                backgroundColor: C.card,
                borderRadius: 16,
                boxShadow: C.shadow,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 18px",
                  boxShadow: `inset 0 -1px 0 ${C.line}`,
                }}
              >
                <p style={text(15, { fontWeight: 500 })}>Settings</p>
                <Glyph name="close" size={18} />
              </div>

              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 48,
                  bottom: 0,
                  width: 190,
                  boxShadow: `inset -1px 0 0 ${C.line}`,
                  padding: "12px 12px 0",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ ...input, height: 32, gap: 8, color: C.faint, fontSize: 12.5 }}>
                  <Glyph name="search" size={14} color={C.faint} />
                  Search
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {NAV_GROUPS.map((group, groupIndex) => (
                    <div
                      key={groupIndex}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        paddingTop: groupIndex ? 10 : 0,
                        boxShadow: groupIndex ? `inset 0 1px 0 ${C.line}` : "none",
                      }}
                    >
                      {group.map((item) => (
                        <div
                          key={item.label}
                          style={{
                            ...text(12.5),
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                            height: 26,
                            padding: "0 8px",
                            borderRadius: 7,
                            backgroundColor: item.selected ? C.pill : "transparent",
                          }}
                        >
                          <Glyph name={item.icon} size={14} />
                          {item.label}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    ...text(12, { color: C.muted }),
                    position: "absolute",
                    left: 20,
                    right: 20,
                    bottom: 14,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  API keys <Glyph name="arrowUp" size={13} color={C.muted} />
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: 190,
                  right: 0,
                  top: 48,
                  bottom: 0,
                  padding: "12px 16px",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32 }}>
                  <span
                    style={{
                      ...text(12.5, { fontWeight: 500 }),
                      padding: "6px 10px",
                      borderRadius: 8,
                      backgroundColor: C.pill,
                    }}
                  >
                    Connectors
                  </span>
                  <span style={text(12.5, { padding: "6px 8px" })}>Skills</span>
                  <span style={text(12.5, { padding: "6px 8px" })}>Plugins</span>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: 2,
                      borderRadius: 9,
                      backgroundColor: C.pill,
                      marginLeft: 4,
                    }}
                  >
                    <span
                      style={{
                        ...text(12),
                        padding: "5px 9px",
                        borderRadius: 7,
                        backgroundColor: C.card,
                        boxShadow: `0 0 0 1px ${C.line}`,
                      }}
                    >
                      Yours
                    </span>
                    <span style={text(12, { padding: "5px 9px" })}>Discover</span>
                  </span>
                  <span
                    style={{
                      ...input,
                      height: 32,
                      gap: 6,
                      flex: 1,
                      minWidth: 0,
                      color: C.faint,
                      fontSize: 12.5,
                    }}
                  >
                    <Glyph name="search" size={13} color={C.faint} />
                    Search
                  </span>
                  <Glyph name="filter" size={16} color={C.muted} />
                  <span style={pillButton(true)}>
                    + Add <Glyph name="chevron" size={12} color="#fff" />
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 100px",
                    ...text(12, { color: C.muted }),
                    padding: "0 8px 8px",
                    boxShadow: `inset 0 -1px 0 ${C.line}`,
                  }}
                >
                  <span>Connector</span>
                  <span>Type</span>
                  <span>Status</span>
                </div>
                {CONNECTORS.map((row) => (
                  <div
                    key={row.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 100px",
                      alignItems: "center",
                      height: 42,
                      padding: "0 8px",
                      boxShadow: `inset 0 -1px 0 ${C.line}`,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10, ...text(13) }}>
                      <span
                        style={{
                          ...text(row.mark.length > 1 ? 8 : 11, {
                            fontWeight: 700,
                            color: row.color,
                          }),
                          width: 24,
                          height: 24,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 7,
                          boxShadow: `inset 0 0 0 1px ${C.line}`,
                        }}
                      >
                        {row.mark}
                      </span>
                      {row.name}
                    </span>
                    <span style={text(12.5, { color: C.muted })}>Web</span>
                    {row.connected ? (
                      <Glyph name="check" size={15} color={C.muted} />
                    ) : (
                      <span
                        style={{
                          ...pillButton(false),
                          height: 26,
                          padding: "0 10px",
                          width: "fit-content",
                          fontSize: 12,
                        }}
                      >
                        Connect
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* The custom connector form */}
            <div
              style={{
                ...fade(!!frame.dialogOpen),
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.28)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 150,
                  top: 70,
                  width: 460,
                  height: 380,
                  boxSizing: "border-box",
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  backgroundColor: C.card,
                  borderRadius: 16,
                  boxShadow: C.shadow,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      height: 24,
                    }}
                  >
                    <p style={text(16, { fontWeight: 500 })}>Add custom connector</p>
                    <Glyph name="close" size={18} />
                  </div>
                  <p style={text(12.5, { color: C.muted })}>
                    Connect Claude to your data and tools.{" "}
                    <span style={link}>Learn more about connectors</span> or get started with{" "}
                    <span style={link}>pre-built ones</span>.
                  </p>
                  <div style={{ ...input, marginTop: 4, ...(focused("name") ? focusRing : {}) }}>
                    {typedName}
                  </div>
                  <p style={text(11.5, { color: C.muted })}>Shown in the connectors list.</p>
                  <div
                    style={{
                      ...input,
                      marginTop: 2,
                      fontSize: 12.5,
                      ...(focused("url") ? focusRing : {}),
                    }}
                  >
                    {placeholderOrValue("MCP server URL", address, !!frame.pasted)}
                  </div>
                  <p style={text(11.5, { color: C.muted })}>
                    The HTTPS address where the server accepts MCP requests, for example
                    https://mcp.example.com/mcp.
                  </p>
                  <p style={text(11.5, { color: C.muted, marginTop: 4 })}>
                    Only use connectors from developers you trust. Anthropic does not control which
                    tools developers make available and cannot verify that they will work as
                    intended or that they won&apos;t change.
                  </p>
                  <p style={text(11.5, { color: C.muted })}>
                    Building an MCP server?{" "}
                    <span style={link}>Report issues and subscribe to updates here</span>
                  </p>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <span style={pillButton(false)}>Cancel</span>
                  <span
                    style={{
                      ...pillButton(true, !!frame.pasted, touch("continue")),
                      ...press(touch("continue")),
                    }}
                  >
                    Continue
                  </span>
                </div>

                {/* Tells the person what to do in the address field */}
                <div
                  style={{
                    ...fade(!!frame.hint),
                    position: "absolute",
                    right: 20,
                    top: 128,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: 24,
                    padding: "0 10px",
                    borderRadius: 8,
                    backgroundColor: colors.accent,
                    color: colors.onAccent,
                    ...text(12, { fontWeight: 600, color: colors.onAccent }),
                  }}
                >
                  Paste here
                  {(["Ctrl", "+", "V"] as const).map((key) =>
                    key === "+" ? (
                      <span key={key}>+</span>
                    ) : (
                      <span
                        key={key}
                        style={{
                          ...text(11, { fontWeight: 700, color: C.ink }),
                          padding: "1px 6px",
                          borderRadius: 5,
                          backgroundColor: "#fff",
                          boxShadow: frame.hint === "keys" ? "none" : "0 1px 0 rgba(0,0,0,0.35)",
                          transform: frame.hint === "keys" ? "translateY(1px) scale(0.92)" : "none",
                          transition: move ?? "transform 120ms ease, box-shadow 120ms ease",
                        }}
                      >
                        {key}
                      </span>
                    ),
                  )}
                  <span
                    style={{
                      position: "absolute",
                      right: 24,
                      bottom: -5,
                      width: 0,
                      height: 0,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderTop: `6px solid ${colors.accent}`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* The pointer */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: frame.cursor.x,
              top: frame.cursor.y,
              width: 22,
              height: 22,
              pointerEvents: "none",
              transition:
                move ??
                "left 750ms cubic-bezier(0.4, 0, 0.2, 1), top 750ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {/* A ripple where the button goes down, the way a screen recording marks a click */}
            <span
              style={{
                position: "absolute",
                left: -9,
                top: -11,
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: "rgba(31,30,29,0.35)",
                opacity: phase === "down" ? 1 : 0,
                transform:
                  phase === "down" ? "scale(0.6)" : phase === "up" ? "scale(1.7)" : "scale(0.6)",
                transition:
                  move ??
                  (phase === "down"
                    ? "opacity 80ms ease-out, transform 80ms ease-out"
                    : phase === "up"
                      ? "opacity 350ms ease-out, transform 350ms ease-out"
                      : "none"),
              }}
            />
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              style={{
                position: "relative",
                transform: phase === "down" ? "scale(0.88)" : "none",
                transformOrigin: "5px 3px",
                transition: move ?? "transform 80ms ease-out",
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
              }}
            >
              <path
                d="M5 3l14 8-6 1.6L10.5 19z"
                fill="#1f1e1d"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: spacing[2] }}>
        {STAGES.map((label, stage) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-current={frame.stage === stage}
            onClick={() => setIndex(FRAMES.findIndex((item) => item.stage === stage))}
            style={{
              width: frame.stage === stage ? 20 : 8,
              height: 8,
              padding: 0,
              border: 0,
              borderRadius: radius.full,
              backgroundColor: frame.stage === stage ? colors.accent : colors.border,
              cursor: "pointer",
              transition: move ?? "width 200ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
