import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EventLabelChips({ labels }) {
  const list = Array.isArray(labels) ? labels.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <View style={styles.row}>
      {list.map((lab) => (
        <View key={lab} style={styles.chip}>
          <Text style={styles.text}>{lab}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { color: '#c4b5fd', fontSize: 12, fontWeight: '600' },
});
