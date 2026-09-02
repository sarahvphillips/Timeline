import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../themeContext';
import { MODES, PALETTES } from '../theme';

export default function SettingsScreen() {
  const { mode, palette, scheme, colors, setMode, setPalette } = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.bg }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Settings</Text>
      <Text style={[styles.intro, { color: colors.faint }]}>
        Appearance is saved on this device. Timeline screens will pick up the same colours as they are moved onto the theme.
      </Text>

      <Text style={[styles.section, { color: colors.muted }]}>Light / dark</Text>
      <Text style={[styles.hint, { color: colors.faint }]}>
        Now using {scheme} {mode === 'system' ? '(from this device)' : '(manual)'}.
      </Text>
      <View style={styles.row}>
        {MODES.map((item) => {
          const on = mode === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.chip,
                { borderColor: colors.cardBorder, backgroundColor: colors.card },
                on && { backgroundColor: colors.blue, borderColor: colors.blue },
              ]}
              onPress={() => setMode(item.id)}
            >
              <Text style={[styles.chipText, { color: on ? '#fff' : colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.section, { color: colors.muted }]}>Colour scheme</Text>
      {PALETTES.map((item) => {
        const on = palette === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.palette,
              { borderColor: colors.cardBorder, backgroundColor: colors.card },
              on && { borderColor: colors.blue },
            ]}
            onPress={() => setPalette(item.id)}
          >
            <View style={[styles.swatch, { backgroundColor: colors.blue }]} />
            <Text style={[styles.paletteLabel, { color: colors.text }]}>{item.label}</Text>
            {on ? <Text style={[styles.onLabel, { color: colors.blueSoft }]}>On</Text> : null}
          </TouchableOpacity>
        );
      })}

      <Text style={[styles.section, { color: colors.muted }]}>Coming next on this screen</Text>
      <Text style={[styles.hint, { color: colors.faint }]}>
        Poem categories, labels, and profile basics will sit here. They are not wired in this pass.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  section: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: {
    fontWeight: '600',
    fontSize: 14,
  },
  palette: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  paletteLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  onLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
