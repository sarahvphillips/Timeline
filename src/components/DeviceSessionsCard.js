import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getOrCreateDeviceId,
  listSessions,
  removeSession,
  removeOtherSessions,
} from '../services/deviceSession';

function platformLabel(platform) {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  if (platform === 'web') return 'Web';
  return platform || 'Unknown';
}

function platformIcon(platform) {
  if (platform === 'ios' || platform === 'android') return 'phone-portrait-outline';
  return 'desktop-outline';
}

function formatLastSeen(iso) {
  if (!iso) return 'unknown';
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return String(iso);
  }
}

export default function DeviceSessionsCard({ uid, colors }) {
  const [thisDeviceId, setThisDeviceId] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const id = await getOrCreateDeviceId();
        if (cancelled) return;
        setThisDeviceId(id);
        const listed = await listSessions(uid);
        if (!cancelled) setSessions(listed);
      } catch (e) {
        console.warn('Could not load signed-in devices', e);
      }
    };
    load();
    const retry = setTimeout(load, 1200);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [uid]);

  const forgetSession = async (session) => {
    if (!uid || !session?.id) return;
    try {
      await removeSession(uid, session.id);
      setSessions((cur) => cur.filter((s) => s.id !== session.id));
    } catch (e) {
      Alert.alert('Could not remove', e?.message || 'Try again.');
    }
  };

  const forgetOtherSessions = async () => {
    if (!uid) return;
    try {
      await removeOtherSessions(uid);
      setSessions((cur) => cur.filter((s) => s.id === thisDeviceId));
    } catch (e) {
      Alert.alert('Could not clear', e?.message || 'Try again.');
    }
  };

  const confirmForget = (session) => {
    const label = platformLabel(session.platform);
    const run = () => forgetSession(session);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove ${label} from this list?`)) run();
      return;
    }
    Alert.alert('Remove device', `Take ${label} off this list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run },
    ]);
  };

  const confirmForgetOthers = () => {
    const run = () => forgetOtherSessions();
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Remove every other device from this list? This device stays.')) run();
      return;
    }
    Alert.alert('Clear other devices', 'Remove every other device from this list? This device stays.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: run },
    ]);
  };

  const thisSession = sessions.find((s) => s.id === thisDeviceId);
  const otherSessions = sessions.filter((s) => s.id !== thisDeviceId);

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.sectionTitle}>SIGNED-IN DEVICES</Text>
        {otherSessions.length ? (
          <TouchableOpacity onPress={confirmForgetOthers}>
            <Text style={styles.clear}>Clear other devices</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={[styles.row, otherSessions.length ? styles.divider : null, { borderBottomColor: colors.cardBorder }]}>
          <Ionicons name={platformIcon(thisSession?.platform || Platform.OS)} size={20} color={colors.blueSoft} />
          <View style={styles.body}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]}>
                {platformLabel(thisSession?.platform || Platform.OS)}
              </Text>
              <Text style={[styles.here, { color: colors.blueSoft }]}>This device</Text>
            </View>
            <Text style={[styles.meta, { color: colors.faint }]}>
              Last seen {formatLastSeen(thisSession?.lastSeen || new Date().toISOString())}
            </Text>
          </View>
        </View>
        {otherSessions.map((s, i) => (
          <View
            key={s.id}
            style={[
              styles.row,
              i < otherSessions.length - 1 ? styles.divider : null,
              { borderBottomColor: colors.cardBorder },
            ]}
          >
            <Ionicons name={platformIcon(s.platform)} size={20} color={colors.blueSoft} />
            <View style={styles.body}>
              <Text style={[styles.name, { color: colors.text }]}>{platformLabel(s.platform)}</Text>
              <Text style={[styles.meta, { color: colors.faint }]}>Last seen {formatLastSeen(s.lastSeen)}</Text>
            </View>
            <TouchableOpacity onPress={() => confirmForget(s)}>
              <Text style={styles.clear}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#7c6ee6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  clear: { color: '#f87171', fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 10 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  here: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
});
