import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { STAMPS, CREDITS_PAUSED } from '../services/rewardsService';

export default function StampsRow({ stamps, credits = 0, colors, onShop, onStamp }) {
  const row = stamps?.length
    ? stamps
    : STAMPS.map((s) => ({ ...s, earned: false }));

  return (
    <View style={[styles.card, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.muted }]}>Stamps</Text>
        {CREDITS_PAUSED ? null : (
          <TouchableOpacity onPress={onShop} accessibilityLabel="Open credits shop">
            <Text style={[styles.credits, { color: colors.blueSoft }]}>Credits {credits} · Shop</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.hint, { color: colors.faint }]}>
        {CREDITS_PAUSED
          ? 'Private. Fill a tile by doing the thing.'
          : 'Private. Fill a tile by doing the thing. First row of four gives +2 credits, once.'}
      </Text>
      <View style={styles.grid}>
        {row.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={styles.cell}
            onPress={() => onStamp && onStamp(s)}
            accessibilityLabel={s.earned ? `${s.label} stamp earned` : `${s.label} stamp`}
          >
            <View
              style={[
                styles.dot,
                s.earned
                  ? { backgroundColor: colors.blue, borderColor: colors.blue }
                  : { backgroundColor: 'transparent', borderColor: colors.cardBorder },
              ]}
            >
              <Text style={styles.mark}>{s.earned ? '✓' : ''}</Text>
            </View>
            <Text style={[styles.label, { color: s.earned ? colors.text : colors.faint }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  credits: {
    fontSize: 13,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 10,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 2,
  },
});
