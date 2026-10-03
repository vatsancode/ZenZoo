import { colors, radius, spacing } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";
import { Modal as RNModal, Pressable, StyleSheet } from "react-native";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.content}>{children}</Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(18, 19, 23, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing[6],
    minWidth: 280,
    maxWidth: "90%",
  },
});
