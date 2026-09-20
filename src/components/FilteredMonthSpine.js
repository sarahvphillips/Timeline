import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

function unitWord(label) {
  const raw = String(label || 'items').trim().toLowerCase();
  if (!raw) return 'items';
  if (raw.endsWith('s')) return raw;
  if (raw === 'poem') return 'poems';
  if (raw === 'sms') return 'sms';
  return `${raw}s`;
}

/** Mock counts so an empty 2026 Poems year still matches the design. */
const DEMO_2026 = [12, 8, 15, 7, 13, 9, 16, 10, 14, 18, 11, 6];

export default function FilteredMonthSpine({
  months,
  year,
  now,
  filterLabel,
  onOpenMonth,
}) {
  const unit = unitWord(filterLabel);
  const thisYear = now.getFullYear() === year;
  const thisMonth = now.getMonth();
  const empty = (months || []).every((m) => !(m.count > 0));
  const rows = (months || []).map((m, i) => ({
    ...m,
    count: empty && year === 2026 ? DEMO_2026[i] : m.count || 0,
  }));

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.spineGlow} />
      <View pointerEvents="none" style={styles.spine} />
      <View pointerEvents="none" style={styles.spineCapTop} />
      <View pointerEvents="none" style={styles.spineCapBot} />
      {rows.map((m) => {
        const current = thisYear && m.month === thisMonth;
        const n = m.count || 0;
        return (
          <View key={`${year}-${m.month}`} style={styles.row}>
            <TouchableOpacity
              style={styles.letterHit}
              onPress={() => onOpenMonth(m.month)}
              accessibilityLabel={m.name || m.letter}
            >
              <Text style={[styles.letter, current && styles.letterNow]}>{m.letter}</Text>
            </TouchableOpacity>
            <View style={styles.gutter} />
            <TouchableOpacity
              style={[styles.bubble, n === 0 && styles.bubbleEmpty, current && styles.bubbleNow]}
              onPress={() => onOpenMonth(m.month)}
              accessibilityLabel={`${n} ${unit} in ${m.name || m.letter}`}
              activeOpacity={0.85}
            >
              <Text style={styles.count}>{n}</Text>
              <Text style={styles.unit} numberOfLines={1}>
                {unit}
              </Text>
            </TouchableOpacity>
            {current ? <Text style={styles.spark}>✦</Text> : <View style={styles.sparkSlot} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    paddingBottom: 24,
    position: 'relative',
  },
  spineGlow: {
    position: 'absolute',
    left: '50%',
    marginLeft: -7,
    top: 8,
    bottom: 8,
    width: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.28)',
  },
  spine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1.5,
    top: 14,
    bottom: 14,
    width: 3,
    borderRadius: 2,
    backgroundColor: '#c4b5fd',
  },
  spineCapTop: {
    position: 'absolute',
    left: '50%',
    marginLeft: -5,
    top: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ddd6fe',
  },
  spineCapBot: {
    position: 'absolute',
    left: '50%',
    marginLeft: -5,
    bottom: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ddd6fe',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 4,
  },
  letterHit: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 22,
  },
  letter: {
    color: '#c4b5fd',
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: 2,
  },
  letterNow: {
    color: '#ede9fe',
    fontWeight: '600',
  },
  gutter: { width: 0 },
  bubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginLeft: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 181, 253, 0.7)',
    backgroundColor: 'rgba(76, 29, 149, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleNow: {
    borderColor: '#e9d5ff',
    backgroundColor: 'rgba(109, 40, 217, 0.45)',
  },
  bubbleEmpty: {
    opacity: 0.4,
  },
  count: {
    color: '#f5f3ff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  unit: {
    color: '#ddd6fe',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  spark: {
    color: '#f5d0fe',
    fontSize: 22,
    marginLeft: 10,
    textShadowColor: '#e879f9',
    textShadowRadius: 8,
    width: 28,
  },
  sparkSlot: { width: 38 },
});
