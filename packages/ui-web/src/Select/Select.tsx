"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Input } from "../Input";
import { textStyle } from "../internal/textStyle";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Shows a search box at the top of the open list. On by default. */
  searchable?: boolean;
  /**
   * Adds a last "+ <createLabel>" choice that lets the user type a value that
   * isn't in `options`. The typed value is reported through `onChange`.
   */
  creatable?: boolean;
  createLabel?: string;
  /**
   * Called for keys pressed while the list is closed. Call preventDefault to
   * stop Select from also acting on the key (e.g. to move to the next field).
   */
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  style?: CSSProperties;
}

const CREATE = "__create__";
const LIST_MAX_HEIGHT = 200;
const PANEL_ESTIMATED_HEIGHT = 300;

export function Select({
  options,
  value,
  onChange,
  id,
  placeholder = "Select",
  disabled,
  searchable = true,
  creatable,
  createLabel = "Add new",
  onKeyDown,
  style,
  ...aria
}: SelectProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const listId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const items = useMemo<SelectOption[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter((option) => option.label.toLowerCase().includes(q))
      : options;
    return creatable ? [...matches, { value: CREATE, label: `+ ${createLabel}` }] : matches;
  }, [options, query, creatable, createLabel]);
  const hasMatches = items.some((item) => item.value !== CREATE);

  const selected = options.find((option) => option.value === value);
  const invalid = aria["aria-invalid"] === true;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.getElementById(`${listId}-${highlight}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlight, listId]);

  function openList() {
    if (disabled) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setOpenUp(below < PANEL_ESTIMATED_HEIGHT && rect.top > below);
    }
    const current = options.findIndex((option) => option.value === value);
    setQuery("");
    setHighlight(current >= 0 ? current : 0);
    setOpen(true);
  }

  function closeList(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(item: SelectOption) {
    setOpen(false);
    if (item.value === CREATE) {
      setDraft(query.trim());
      setCreating(true);
      return;
    }
    onChange(item.value);
    triggerRef.current?.focus();
  }

  function finishCreating(commit: boolean, refocus: boolean) {
    const text = draft.trim();
    if (commit && text) onChange(text);
    setCreating(false);
    if (refocus && id) setTimeout(() => document.getElementById(id)?.focus(), 0);
  }

  // Keys while the list is open. They arrive from the search box, or from the
  // trigger itself when search is turned off.
  function handleOpenKeyDown(event: KeyboardEvent<HTMLElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlight((index) => Math.min(index + 1, items.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlight((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        if (searchable) break;
        event.preventDefault();
        setHighlight(0);
        break;
      case "End":
        if (searchable) break;
        event.preventDefault();
        setHighlight(items.length - 1);
        break;
      case "Enter":
      case " ": {
        // Space has to stay a typeable character in the search box.
        if (event.key === " " && searchable) break;
        event.preventDefault();
        const item = items[highlight];
        if (item) choose(item);
        break;
      }
      case "Escape":
        // Close the list only; a second Escape reaches whatever is behind it.
        event.preventDefault();
        event.stopPropagation();
        closeList(true);
        break;
      case "Tab":
        closeList(false);
        break;
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (open) {
      handleOpenKeyDown(event);
      return;
    }
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (["ArrowDown", "ArrowUp", " ", "Enter"].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  const fieldStyle: CSSProperties = {
    ...textStyle("body"),
    height: 44,
    paddingInline: spacing[4],
    borderRadius: radius.md,
    border: `1px solid ${invalid ? colors.danger : "transparent"}`,
    backgroundColor: colors.surfaceSunken,
    boxSizing: "border-box",
    width: "100%",
    ...style,
  };

  if (creating) {
    return (
      <span style={{ display: "inline-block", width: "100%" }}>
        <input
          id={id}
          autoFocus
          autoComplete="off"
          placeholder={createLabel}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finishCreating(true, false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finishCreating(true, true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finishCreating(false, true);
            }
          }}
          style={{ ...fieldStyle, color: colors.ink }}
        />
      </span>
    );
  }

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={aria["aria-label"]}
        disabled={disabled}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        style={{
          ...fieldStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[2],
          textAlign: "start",
          color: disabled ? colors.inkFaint : selected || value ? colors.ink : colors.inkFaint,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? (value || placeholder)}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0, color: colors.inkMuted }}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(openUp
              ? { bottom: "100%", marginBottom: spacing[1] }
              : { top: "100%", marginTop: spacing[1] }),
            padding: spacing[1],
            backgroundColor: colors.surfaceRaised,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: elevation.md.web,
            boxSizing: "border-box",
            zIndex: 20,
          }}
        >
          {searchable ? (
            <div style={{ padding: spacing[1], paddingBottom: spacing[2] }}>
              <Input
                autoFocus
                type="search"
                autoComplete="off"
                placeholder="Search"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={items[highlight] ? `${listId}-${highlight}` : undefined}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={handleOpenKeyDown}
              />
            </div>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            style={{
              maxHeight: LIST_MAX_HEIGHT,
              overflowY: "auto",
              margin: 0,
              padding: 0,
              listStyle: "none",
            }}
          >
            {!hasMatches ? (
              <li
                role="presentation"
                style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[3] }}
              >
                {query.trim() ? "No matches" : "No options"}
              </li>
            ) : null}
            {items.map((item, index) => {
              const isCreate = item.value === CREATE;
              return (
                <li
                  key={item.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={item.value === value}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(item);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  style={{
                    ...textStyle(item.value === value ? "bodyMedium" : "body"),
                    padding: `${spacing[2]}px ${spacing[3]}px`,
                    borderRadius: radius.md,
                    color: isCreate ? colors.accent : colors.ink,
                    cursor: "pointer",
                    backgroundColor: index === highlight ? colors.surfaceSunken : "transparent",
                  }}
                >
                  {item.label}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
