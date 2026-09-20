import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLabels } from '../services/profileService';

export default function LabelPicker({ value = [], onChange, editable = true }) {
  const [options, setOptions] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getLabels().then((list) => {
        if (!alive) return;
        const extra = (value || []).filter((l) => list.indexOf(l) === -1);
        setOptions([...list, ...extra]);
      });
      return () => {
        alive = false;
      };
    }, [value])
  );

  if (!options.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Labels</Text>
      <Text style={styles.hint}>From Settings. Shown on the expanded timeline card.</Text>
      <View style={styles.row}>
        {options.map((lab) => {
          const on = (value || []).includes(lab);
          return (
            <TouchableOpacity
              key={lab}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => {
                if (!editable) return;
                onChange(on ? value.filter((x) => x !== lab) : [...value, lab]);
              }}
              disabled={!editable}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{lab}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  hint: { color: '#64748b', fontSize: 12, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
});
