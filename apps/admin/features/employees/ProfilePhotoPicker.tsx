"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, textStyle } from "@zenzoo/ui-web";
import { useRef, useState, type ChangeEvent } from "react";
import EmployeeAvatar from "./EmployeeAvatar";

interface ProfilePhotoPickerProps {
  /** Used for the initials shown until a picture is chosen. */
  name: string;
  /** The chosen picture as a data URL, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const MAX_BYTES = 2 * 1024 * 1024;

/** Choose or remove a profile picture. The picture lasts until the page reloads - nothing stores it yet. */
export default function ProfilePhotoPicker({
  name,
  value,
  onChange,
  disabled,
}: ProfilePhotoPickerProps) {
  const { colors, radius, spacing } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Lets the same file be chosen again after removing it.
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Pick a picture under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      onChange(String(reader.result));
    };
    reader.onerror = () => setError("Couldn't read that file. Try another.");
    reader.readAsDataURL(file);
  }

  return (
    <div
      style={{
        gridColumn: "span 12",
        display: "flex",
        alignItems: "center",
        gap: spacing[5],
        padding: spacing[5],
        border: `1px dashed ${colors.border}`,
        borderRadius: radius.lg,
      }}
    >
      <EmployeeAvatar name={name} photoUrl={value || undefined} size={88} />
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[3], minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
          <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
            {value ? "Looking good" : "Add a photo"}
          </div>
          {error ? (
            <div style={{ ...textStyle("footnote"), color: colors.danger }} role="alert">
              {error}
            </div>
          ) : (
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
              JPG or PNG, up to 2 MB.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: spacing[2] }}>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {value ? "Change photo" : "Choose photo"}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() => onChange("")}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        hidden
        aria-label="Profile photo"
      />
    </div>
  );
}
