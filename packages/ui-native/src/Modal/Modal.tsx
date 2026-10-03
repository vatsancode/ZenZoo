import { useTheme } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";
import { Modal as RNModal, Pressable } from "react-native";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  const { colors, radius, spacing, elevation } = useTheme();

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          alignItems: "center",
          justifyContent: "center",
          padding: spacing[8],
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: colors.surfaceRaised,
            borderRadius: radius.xl,
            padding: spacing[8],
            minWidth: 280,
            maxWidth: "90%",
            ...elevation.lg.native,
          }}
        >
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
