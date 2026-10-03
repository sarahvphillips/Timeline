import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../themeContext';
import { createTimelineShare, timelineSharePreview, copyTextToClipboard } from '../services/shareService';

export default function ShareTimelineScreen() {
  const { colors } = useTheme();
  const [count, setCount] = useState(0);
  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const preview = await timelineSharePreview();
      setCount(preview.count || 0);
      setShare(preview.active && preview.active.code ? preview.active : null);
    } catch {
      setCount(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onShare = async () => {
    setBusy(true);
    try {
      const result = await createTimelineShare();
      setShare(result);
      Alert.alert(
        result.already ? 'Invite still open' : 'Invite ready',
        `${result.count} events. Send this code to one person. It stops working once they accept.`
      );
    } catch (e) {
      Alert.alert('Could not share', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!share?.code) return;
    await copyTextToClipboard(share.code);
    Alert.alert('Copied', 'The invite code is on the clipboard.');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.page}>
      <Text style={[styles.title, { color: colors.text }]}>Share your timeline</Text>
      <Text style={[styles.body, { color: colors.faint }]}>
        One other Timeline user can take a copy of your events: titles, dates, and text. Photos and
        recordings stay on your device. Events a friend already shared with you are left out. A second
        person cannot use the same code.
      </Text>
      <Text style={[styles.count, { color: colors.text }]}>
        {count} event{count === 1 ? '' : 's'} ready to share
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.blue }, busy && { opacity: 0.6 }]}
        onPress={onShare}
        disabled={busy || share?.status === 'accepted'}
      >
        <Text style={styles.buttonText}>
          {busy ? 'Preparing…' : share?.status === 'accepted' ? 'Already shared with one person' : 'Create invite'}
        </Text>
      </TouchableOpacity>
      {share?.code ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.code, { color: colors.text }]}>{share.code}</Text>
          <Text style={[styles.body, { color: colors.faint }]}>
            {share.status === 'accepted'
              ? 'Someone has already accepted this.'
              : 'They open Utilities → Enter invite code, and paste this. It lasts 14 days.'}
          </Text>
          {share.status !== 'accepted' ? (
            <TouchableOpacity onPress={onCopy}>
              <Text style={[styles.copy, { color: colors.blue }]}>Copy code</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  count: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  card: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 16 },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  copy: { fontSize: 16, fontWeight: '700' },
});
