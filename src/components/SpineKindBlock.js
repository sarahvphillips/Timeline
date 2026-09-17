import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const BUBBLE_SIZE = 78;
const VERT_GAP = 62;
const LABEL_COL = 78;
const OFFSETS = [28, 72, 44, 96, 56];

function quadPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function CurvedDashedSpoke({ side, distance, bubbleCenterY, spineY }) {
  const start = { x: 0, y: spineY };
  const endX = side === 'right' ? distance : -distance;
  const end = { x: endX, y: bubbleCenterY };
  const midX = endX * 0.45;
  const bow = side === 'right' ? Math.min(36, Math.abs(endX) * 0.28) : -Math.min(36, Math.abs(endX) * 0.28);
  const control = {
    x: midX + bow,
    y: spineY + (bubbleCenterY - spineY) * 0.35,
  };

  const steps = Math.max(8, Math.round(Math.abs(endX) / 7));
  const dots = [];
  for (let i = 1; i < steps; i += 1) {
    if (i % 2 === 0) continue;
    const t = i / steps;
    dots.push(quadPoint(start, control, end, t));
  }

  const minX = Math.min(0, endX, control.x) - 4;
  const maxX = Math.max(0, endX, control.x) + 4;
  const minY = Math.min(spineY, bubbleCenterY, control.y) - 4;
  const maxY = Math.max(spineY, bubbleCenterY, control.y) + 4;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '50%',
        marginLeft: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY,
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

function staggerOffset(seed, bubbleIndex) {
  const hash = (Number(seed) * 17 + bubbleIndex * 3) % OFFSETS.length;
  return OFFSETS[hash];
}

export default function SpineKindBlock({
  id,
  label,
  current,
  bubbles,
  blockIndex,
  glowKey,
  onOpenLabel,
  onOpenBubble,
}) {
  const list = bubbles || [];
  const primaryLeft = blockIndex % 2 === 0;
  const n = list.length;
  const stackHeight = n === 0 ? 88 : Math.max(88, (n - 1) * VERT_GAP + BUBBLE_SIZE + 24);
  const spineY = stackHeight / 2;

  const placements = list.map((b, i) => {
    let side = primaryLeft ? 'left' : 'right';
    if (n >= 4 && i === n - 1) side = primaryLeft ? 'right' : 'left';
    else if (n >= 5 && i === 2) side = primaryLeft ? 'right' : 'left';
    const offset = staggerOffset(id || blockIndex, i);
    const distance = LABEL_COL / 2 + 8 + offset + BUBBLE_SIZE / 2;
    const bubbleCenterY =
      n === 1 ? spineY : spineY - ((n - 1) * VERT_GAP) / 2 + i * VERT_GAP;
    return { bubble: b, side, distance, bubbleCenterY };
  });

  return (
    <View style={[styles.block, { height: stackHeight, marginBottom: 40 }]}>
      {placements.map((p) => (
        <CurvedDashedSpoke
          key={`spoke-${p.bubble.kind}`}
          side={p.side}
          distance={p.distance}
          bubbleCenterY={p.bubbleCenterY}
          spineY={spineY}
        />
      ))}

      <TouchableOpacity
        style={[styles.labelCol, { top: spineY - 28 }]}
        onPress={onOpenLabel}
        accessibilityLabel={`Open ${label}`}
      >
        <View style={[styles.dot, current && styles.dotCurrent]} />
        <Text style={[styles.label, current && styles.labelCurrent]}>{label}</Text>
        {current ? <Text style={styles.nowMark}>★</Text> : null}
      </TouchableOpacity>

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
            glow={glowKey === `${id}:${p.bubble.kind}`}
            onPress={() => onOpenBubble(p.bubble)}
            style={[styles.bubbleAbs, leftStyle, { top: p.bubbleCenterY - half }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'relative',
    width: '100%',
  },
  labelCol: {
    position: 'absolute',
    left: '50%',
    marginLeft: -LABEL_COL / 2,
    width: LABEL_COL,
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
  dotCurrent: {
    backgroundColor: '#fde047',
    borderColor: '#facc15',
  },
  label: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  labelCurrent: {
    color: '#fde047',
  },
  nowMark: {
    color: '#fde047',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
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
