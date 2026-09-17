import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const BUBBLE_SIZE = 78;
const VERT_GAP = 62;
const LABEL_COL = 86;
const OFFSETS = [36, 84, 52, 108, 64, 44, 96];

function quadPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function seedNumber(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.abs(Math.trunc(seed));
  const s = String(seed || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
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
  const hash = (seedNumber(seed) + bubbleIndex * 3) % OFFSETS.length;
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
  boxedLabel = false,
}) {
  const list = bubbles || [];
  const primaryLeft = blockIndex % 2 === 0;
  const n = list.length;
  const stackHeight = n === 0 ? 96 : Math.max(96, (n - 1) * VERT_GAP + BUBBLE_SIZE + 28);
  const spineY = stackHeight / 2;
  const seed = id ?? blockIndex;

  const placements = list.map((b, i) => {
    let side = (i + (primaryLeft ? 0 : 1)) % 2 === 0 ? 'left' : 'right';
    if (n >= 5 && i === 2) side = primaryLeft ? 'right' : 'left';
    const offset = staggerOffset(seed, i);
    const distance = LABEL_COL / 2 + 18 + offset + BUBBLE_SIZE / 2;
    const jitter = ((seedNumber(`${seed}:${i}`) % 5) - 2) * 4;
    const bubbleCenterY =
      n === 1 ? spineY + jitter : spineY - ((n - 1) * VERT_GAP) / 2 + i * VERT_GAP + jitter;
    return { bubble: b, side, distance, bubbleCenterY };
  });

  const labelTop = boxedLabel ? spineY - 34 : spineY - 28;

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
        style={[styles.labelCol, { top: labelTop }]}
        onPress={onOpenLabel}
        accessibilityLabel={`Open ${label}`}
      >
        <View style={[boxedLabel && styles.labelChip, boxedLabel && current && styles.labelChipCurrent]}>
          <View style={[styles.dot, current && styles.dotCurrent]} />
          <Text style={[styles.label, current && styles.labelCurrent]}>{label}</Text>
          {current ? <Text style={styles.nowMark}>★</Text> : null}
        </View>
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
    zIndex: 5,
  },
  labelChip: {
    backgroundColor: '#0f1024',
    borderWidth: 1.5,
    borderColor: '#8b5cf6',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  labelChipCurrent: {
    borderColor: '#facc15',
    backgroundColor: '#1a1630',
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
