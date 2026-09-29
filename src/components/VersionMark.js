import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../themeContext';
import { versionLine } from '../version';

export default function VersionMark({ compact = false }) {
  const { colors } = useTheme();
  return (
    <Text
      pointerEvents="none"
      style={[styles.mark, compact && styles.compact, { color: colors.faint }]}
      accessibilityLabel={`App version ${versionLine()}`}
    >
      {compact ? versionLine().replace(' · 2026-', ' · ') : versionLine()}
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  compact: {
    fontSize: 11,
    paddingRight: 12,
  },
});
