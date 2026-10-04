import {
  colorGroups,
  sampleLineItems,
  sampleProduct,
  spacing as spacingTokens,
  radius as radiusTokens,
  textStyleOrder,
  typeSampleLine,
  useTheme,
  type ColorTokens,
} from "@zenzoo/design-tokens";
import { Button, Card, Input, List, Modal, textStyle } from "@zenzoo/ui-native";
import { useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing[12] }}>
      <Text style={[textStyle("title1"), { color: colors.ink, marginBottom: spacing[6] }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ColorSwatch({ name, value }: { name: string; value: string }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ width: 120 }}>
      <View
        style={{
          height: 56,
          borderRadius: radius.lg,
          backgroundColor: value,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />
      <Text style={[textStyle("footnote"), { color: colors.ink, marginTop: spacing[2] }]}>
        {name}
      </Text>
      <Text style={[textStyle("dataSmall"), { color: colors.inkMuted }]}>{value}</Text>
    </View>
  );
}

export default function StyleGuideScreen() {
  const { colors, radius, spacing, elevation } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}
      contentContainerStyle={{ padding: spacing[6] }}
    >
      <Text style={[textStyle("display"), { color: colors.ink, marginBottom: spacing[2] }]}>
        Style guide
      </Text>
      <Text style={[textStyle("callout"), { color: colors.inkMuted, marginBottom: spacing[10] }]}>
        Read live from @zenzoo/design-tokens and @zenzoo/ui-native.
      </Text>

      <Section title="Color">
        {colorGroups.map((group) => (
          <View key={group.title} style={{ marginBottom: spacing[6] }}>
            <Text
              style={[textStyle("caption"), { color: colors.inkMuted, marginBottom: spacing[3] }]}
            >
              {group.title.toUpperCase()}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[4] }}>
              {group.keys.map((key: keyof ColorTokens) => (
                <ColorSwatch key={key} name={key} value={colors[key]} />
              ))}
            </View>
          </View>
        ))}
      </Section>

      <Section title="Typography">
        <View style={{ gap: spacing[4] }}>
          {textStyleOrder.map((name) => (
            <View
              key={name}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                paddingBottom: spacing[3],
              }}
            >
              <Text style={[textStyle("dataSmall"), { color: colors.inkMuted }]}>{name}</Text>
              <Text style={[textStyle(name), { color: colors.ink }]}>{typeSampleLine}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Spacing">
        <View style={{ gap: spacing[2] }}>
          {Object.entries(spacingTokens).map(([key, value]) => (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: spacing[4] }}>
              <Text style={[textStyle("dataSmall"), { color: colors.inkMuted, width: 80 }]}>
                space-{key} ({value}px)
              </Text>
              <View
                style={{
                  height: 16,
                  width: value,
                  backgroundColor: colors.accent,
                  borderRadius: radius.sm,
                }}
              />
            </View>
          ))}
        </View>
      </Section>

      <Section title="Radius">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[6] }}>
          {Object.entries(radiusTokens).map(([key, value]) => (
            <View key={key} style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: value,
                  backgroundColor: colors.surfaceSunken,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <Text
                style={[textStyle("footnote"), { color: colors.inkMuted, marginTop: spacing[2] }]}
              >
                {key}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Elevation">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[8] }}>
          {Object.entries(elevation).map(([key, level]) => (
            <View key={key} style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 88,
                  height: 56,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceRaised,
                  ...level.native,
                }}
              />
              <Text
                style={[textStyle("footnote"), { color: colors.inkMuted, marginTop: spacing[3] }]}
              >
                shadow-{key}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Button">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[3] }}>
          <Button label="Charge $48.50" variant="primary" onPress={() => {}} />
          <Button label="Cancel" variant="secondary" onPress={() => {}} />
          <Button label="Void sale" variant="danger" onPress={() => {}} />
          <Button label="Charge $48.50" variant="primary" disabled onPress={() => {}} />
        </View>
      </Section>

      <Section title="Input">
        <View style={{ gap: spacing[4], maxWidth: 280 }}>
          <Input placeholder={sampleProduct.name} />
          <Input defaultValue="-3" invalid />
          <Input defaultValue={sampleProduct.sku} editable={false} />
        </View>
      </Section>

      <Section title="Card">
        <Card style={{ maxWidth: 280 }}>
          <Text style={[textStyle("title3"), { color: colors.ink }]}>{sampleProduct.name}</Text>
          <Text style={[textStyle("callout"), { color: colors.inkMuted, marginTop: spacing[1] }]}>
            {sampleProduct.description}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: spacing[4],
            }}
          >
            <Text style={[textStyle("dataSmall"), { color: colors.inkMuted }]}>
              {sampleProduct.sku}
            </Text>
            <Text style={[textStyle("data"), { color: colors.ink }]}>{sampleProduct.price}</Text>
          </View>
        </Card>
      </Section>

      <Section title="List">
        <List
          data={sampleLineItems}
          keyExtractor={(row) => row.sku}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing[4],
              }}
            >
              <View>
                <Text style={[textStyle("headline"), { color: colors.ink }]}>{item.item}</Text>
                <Text style={[textStyle("dataSmall"), { color: colors.inkMuted }]}>{item.sku}</Text>
              </View>
              <Text style={[textStyle("data"), { color: colors.ink }]}>{item.total}</Text>
            </View>
          )}
        />
      </Section>

      <Section title="Modal">
        <Button label="Void this sale" variant="secondary" onPress={() => setModalOpen(true)} />
        <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
          <Text style={[textStyle("title2"), { color: colors.ink }]}>Void this sale?</Text>
          <Text style={[textStyle("callout"), { color: colors.inkMuted, marginTop: spacing[2] }]}>
            This removes all 3 items from the current sale. This can&apos;t be undone.
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button label="Keep sale" variant="secondary" onPress={() => setModalOpen(false)} />
            <Button label="Void sale" variant="danger" onPress={() => setModalOpen(false)} />
          </View>
        </Modal>
      </Section>
    </ScrollView>
  );
}
