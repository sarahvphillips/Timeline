import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getEvents, getYearBubbleSummaries, EVENTS_FIRESTORE_SYNC_ENABLED } from '../services/eventService';
import HomeFab from '../components/HomeFab';

function DottedSpoke({ side }) {
  const dots = Array.from({ length: 5 }, (_, i) => i);
  return (
    <View style={[styles.spoke, side === 'left' ? styles.spokeLeft : styles.spokeRight]}>
      {dots.map((i) => (
        <View key={i} style={styles.spokeDot} />
      ))}
    </View>
  );
}

function KindBubble({ bubble, glow, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.kindBubble,
        { backgroundColor: bubble.color, borderColor: bubble.color },
        glow && styles.kindBubbleGlow,
      ]}
      onPress={onPress}
      accessibilityLabel={`${bubble.label} ${bubble.count}`}
      activeOpacity={0.85}
    >
      <Text style={styles.kindLabel} numberOfLines={1}>
        {bubble.label}
      </Text>
      <Text style={styles.kindCount}>{bubble.count}</Text>
    </TouchableOpacity>
  );
}

export default function YearOverviewScreen({ navigation }) {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Always await cloud pull (via getEvents) before painting spine — never flash stale/empty cache.
    setLoading(true);
    try {
      const events = await getEvents();
      setYears(getYearBubbleSummaries(events));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const glowKey = useMemo(() => {
    let best = null;
    let bestCount = 0;
    years.forEach((y) => {
      (y.bubbles || []).forEach((b) => {
        if (b.count > bestCount) {
          bestCount = b.count;
          best = `${y.year}:${b.kind}`;
        }
      });
    });
    return best;
  }, [years]);

  const openYear = (year) => {
    navigation.navigate('MonthOverview', { year });
  };

  const openBubble = (year, bubble) => {
    // TODO: MonthOverview / WeekOverview do not filter by kind yet — pass params for a later pass.
    navigation.navigate('MonthOverview', {
      year,
      kind: bubble.kind,
      category: bubble.filter?.category,
      source: bubble.filter?.source,
      hobbyType: bubble.filter?.hobbyType,
      bubbleFilter: bubble.filter,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        {EVENTS_FIRESTORE_SYNC_ENABLED ? (
          <Text style={styles.syncHint}>Syncing events…</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.spine} />
        {years.map((item, index) => {
          const left = index % 2 === 0;
          const bubbles = item.bubbles || [];
          return (
            <View key={item.year} style={styles.yearBlock}>
              <View style={[styles.yearRow, left ? styles.yearRowLeft : styles.yearRowRight]}>
                {left ? (
                  <View style={[styles.bubbleColumn, styles.bubbleColumnLeft]}>
                    {bubbles.length === 0 ? (
                      <View style={styles.bubbleColumnEmpty} />
                    ) : (
                      bubbles.map((b) => (
                        <View key={b.kind} style={[styles.bubbleRow, styles.bubbleRowLeft]}>
                          <KindBubble
                            bubble={b}
                            glow={glowKey === `${item.year}:${b.kind}`}
                            onPress={() => openBubble(item.year, b)}
                          />
                          <DottedSpoke side="left" />
                        </View>
                      ))
                    )}
                  </View>
                ) : (
                  <View style={styles.sideSpacer} />
                )}

                <TouchableOpacity
                  style={styles.yearCol}
                  onPress={() => openYear(item.year)}
                  accessibilityLabel={`Open ${item.year}`}
                >
                  <View style={styles.dot} />
                  <Text style={styles.year}>{item.year}</Text>
                </TouchableOpacity>

                {!left ? (
                  <View style={[styles.bubbleColumn, styles.bubbleColumnRight]}>
                    {bubbles.length === 0 ? (
                      <View style={styles.bubbleColumnEmpty} />
                    ) : (
                      bubbles.map((b) => (
                        <View key={b.kind} style={[styles.bubbleRow, styles.bubbleRowRight]}>
                          <DottedSpoke side="right" />
                          <KindBubble
                            bubble={b}
                            glow={glowKey === `${item.year}:${b.kind}`}
                            onPress={() => openBubble(item.year, b)}
                          />
                        </View>
                      ))
                    )}
                  </View>
                ) : (
                  <View style={styles.sideSpacer} />
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const BUBBLE_SIZE = 78;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
  },
  center: {
    flex: 1,
    backgroundColor: '#0f1024',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncHint: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 14,
  },
  scroll: {
    paddingVertical: 36,
    paddingHorizontal: 10,
    paddingBottom: 100,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 3,
    marginLeft: -1.5,
    backgroundColor: '#8b5cf6',
    borderRadius: 2,
  },
  yearBlock: {
    marginBottom: 36,
    minHeight: 88,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearRowLeft: {},
  yearRowRight: {},
  yearCol: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#c4b5fd',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    marginBottom: 4,
  },
  year: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  bubbleColumn: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
  },
  bubbleColumnLeft: {
    alignItems: 'flex-end',
  },
  bubbleColumnRight: {
    alignItems: 'flex-start',
  },
  bubbleColumnEmpty: {
    minHeight: 24,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubbleRowLeft: {
    justifyContent: 'flex-end',
  },
  bubbleRowRight: {
    justifyContent: 'flex-start',
  },
  sideSpacer: {
    flex: 1,
  },
  spoke: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 28,
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  spokeLeft: {
    marginLeft: 4,
  },
  spokeRight: {
    marginRight: 4,
  },
  spokeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#e2e8f0',
    opacity: 0.85,
  },
  kindBubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  kindBubbleGlow: {
    shadowColor: '#60a5fa',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 3,
    borderColor: '#93c5fd',
  },
  kindLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  kindCount: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
});
