import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getEvents, getYearBubbleSummaries, EVENTS_FIRESTORE_SYNC_ENABLED } from '../services/eventService';
import HomeFab from '../components/HomeFab';

const BUBBLE_SIZE = 78;
const VERT_GAP = 62;
const YEAR_COL = 72;
const OFFSETS = [28, 72, 44, 96, 56]; // near / mid / far stagger cycle (px beyond year column edge)

/** Sample a quadratic Bézier: (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2 */
function quadPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/**
 * Dashed organic arc from spine year-dot to bubble center, drawn as small dots
 * along a quadratic Bézier (no react-native-svg dependency).
 */
function CurvedDashedSpoke({ side, distance, bubbleCenterY, spineY }) {
  const start = { x: 0, y: spineY };
  const endX = side === 'right' ? distance : -distance;
  const end = { x: endX, y: bubbleCenterY };
  // Control point: bow the arc outward and slightly toward mid-height for an organic sweep
  const midX = endX * 0.45;
  const bow = side === 'right' ? Math.min(36, Math.abs(endX) * 0.28) : -Math.min(36, Math.abs(endX) * 0.28);
  const control = {
    x: midX + bow,
    y: spineY + (bubbleCenterY - spineY) * 0.35,
  };

  const steps = Math.max(8, Math.round(Math.abs(endX) / 7));
  const dots = [];
  for (let i = 1; i < steps; i += 1) {
    // skip every other sample → dashed feel
    if (i % 2 === 0) continue;
    const t = i / steps;
    const p = quadPoint(start, control, end, t);
    dots.push(p);
  }

  // Bounding box so the absolute dots sit correctly relative to the spine center
  const minX = Math.min(0, endX, control.x) - 4;
  const maxX = Math.max(0, endX, control.x) + 4;
  const minY = Math.min(spineY, bubbleCenterY, control.y) - 4;
  const maxY = Math.max(spineY, bubbleCenterY, control.y) + 4;
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '50%',
        marginLeft: minX,
        top: minY,
        width,
        height,
        zIndex: 1,
      }}
    >
      {dots.map((p, i) => (
        <View
          key={i}
          style={[
            styles.spokeDot,
            {
              position: 'absolute',
              left: p.x - minX - 1.5,
              top: p.y - minY - 1.5,
            },
          ]}
        />
      ))}
    </View>
  );
}

function KindBubble({ bubble, glow, onPress, style }) {
  return (
    <TouchableOpacity
      style={[
        styles.kindBubble,
        { backgroundColor: bubble.color, borderColor: bubble.color },
        glow && styles.kindBubbleGlow,
        style,
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

function staggerOffset(year, bubbleIndex) {
  // Cycle near/mid/far; slight year hash so adjacent years don't look identical
  const hash = (Number(year) * 17 + bubbleIndex * 3) % OFFSETS.length;
  return OFFSETS[hash];
}

function YearBlock({ item, yearIndex, glowKey, onOpenYear, onOpenBubble }) {
  const bubbles = item.bubbles || [];
  const primaryLeft = yearIndex % 2 === 0;
  const n = bubbles.length;
  // Vertical stack centered on the year marker; grow block with bubble count
  const stackHeight = n === 0 ? 88 : Math.max(88, (n - 1) * VERT_GAP + BUBBLE_SIZE + 24);
  const spineY = stackHeight / 2;

  const placements = bubbles.map((b, i) => {
    // Alternate primary side, but allow some to flip slightly across for fan variety
    let side = primaryLeft ? 'left' : 'right';
    if (n >= 4 && i === n - 1) {
      side = primaryLeft ? 'right' : 'left';
    } else if (n >= 5 && i === 2) {
      side = primaryLeft ? 'right' : 'left';
    }
    const offset = staggerOffset(item.year, i);
    // Distance from spine center to bubble center
    const distance = YEAR_COL / 2 + 8 + offset + BUBBLE_SIZE / 2;
    // Vertical stagger: distribute around spineY
    const bubbleCenterY =
      n === 1
        ? spineY
        : spineY - ((n - 1) * VERT_GAP) / 2 + i * VERT_GAP;
    return { bubble: b, side, distance, bubbleCenterY, offset };
  });

  return (
    <View style={[styles.yearBlock, { height: stackHeight, marginBottom: 40 }]}>
      {/* Curved dashed spokes behind bubbles */}
      {placements.map((p) => (
        <CurvedDashedSpoke
          key={`spoke-${p.bubble.kind}`}
          side={p.side}
          distance={p.distance}
          bubbleCenterY={p.bubbleCenterY}
          spineY={spineY}
        />
      ))}

      {/* Year marker on spine */}
      <TouchableOpacity
        style={[styles.yearColAbs, { top: spineY - 28 }]}
        onPress={() => onOpenYear(item.year)}
        accessibilityLabel={`Open ${item.year}`}
      >
        <View style={styles.dot} />
        <Text style={styles.year}>{item.year}</Text>
      </TouchableOpacity>

      {/* Staggered bubbles */}
      {placements.map((p) => {
        const half = BUBBLE_SIZE / 2;
        const leftStyle =
          p.side === 'right'
            ? { left: '50%', marginLeft: p.distance - half }
            : { left: '50%', marginLeft: -(p.distance + half) };
        return (
          <KindBubble
            key={p.bubble.kind}
            bubble={p.bubble}
            glow={glowKey === `${item.year}:${p.bubble.kind}`}
            onPress={() => onOpenBubble(item.year, p.bubble)}
            style={[
              styles.bubbleAbs,
              leftStyle,
              { top: p.bubbleCenterY - half },
            ]}
          />
        );
      })}
    </View>
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
        {years.map((item, index) => (
          <YearBlock
            key={item.year}
            item={item}
            yearIndex={index}
            glowKey={glowKey}
            onOpenYear={openYear}
            onOpenBubble={openBubble}
          />
        ))}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

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
    position: 'relative',
    width: '100%',
  },
  yearColAbs: {
    position: 'absolute',
    left: '50%',
    marginLeft: -YEAR_COL / 2,
    width: YEAR_COL,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
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
  bubbleAbs: {
    position: 'absolute',
    zIndex: 2,
  },
  spokeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#e2e8f0',
    opacity: 0.9,
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
