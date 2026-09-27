import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function MenuSection({ title, right, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right || null}
      </View>
      {children}
    </View>
  );
}

export function MenuCard({ colors, children }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {children}
    </View>
  );
}

export function MenuRow({
  colors,
  icon,
  label,
  onPress,
  last,
  danger,
  meta,
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardBorder }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons
        name={icon}
        size={20}
        color={danger ? '#f87171' : colors.blueSoft}
        style={styles.icon}
      />
      <View style={styles.body}>
        <Text style={[styles.label, { color: danger ? '#f87171' : colors.text }]}>{label}</Text>
        {meta ? <Text style={[styles.meta, { color: colors.faint }]}>{meta}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    marginTop: 18,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#7c6ee6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  icon: { width: 26 },
  body: { flex: 1, paddingHorizontal: 8 },
  label: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
});
