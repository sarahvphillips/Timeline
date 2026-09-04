import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  getInviteByCode,
  getSharedEvent,
  acceptInviteByCode,
} from '../services/shareService';

export default function AcceptInviteScreen({ navigation, route }) {
  const initialCode = String(route.params?.code || '').trim().toUpperCase();
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (initialCode) {
      lookup(initialCode);
    }
  }, [initialCode]);

  const lookup = async (value) => {
    const normalised = String(value || '').trim().toUpperCase();
    if (normalised.length < 4) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const invite = await getInviteByCode(normalised);
      if (!invite) {
        setPreview({ error: 'No invite found for that code.' });
        return;
      }
      let shared = null;
      try {
        shared = await getSharedEvent(invite.shareId);
      } catch (_) {
        shared = null;
      }
      if (!shared) {
        shared = {
          id: invite.shareId,
          title: invite.eventTitle || 'Shared event',
          date: invite.createdAt,
          description: '',
        };
      }
      setPreview({ invite, shared });
    } catch (e) {
      setPreview({ error: e?.message || 'Could not look up invite.' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleAccept = async () => {
    const normalised = String(code || '').trim().toUpperCase();
    if (!normalised) {
      Alert.alert('Enter a code', 'Paste the invite code from your friend.');
      return;
    }
    setAccepting(true);
    try {
      const result = await acceptInviteByCode(normalised);
      Alert.alert(
        result.alreadyParticipant ? 'Already shared' : 'Invite accepted',
        result.alreadyParticipant
          ? 'This event is already on your timeline.'
          : `"${result.shared?.title || 'Event'}" is now on your timeline and in Events with friends.`,
        [
          {
            text: 'View Events with friends',
            onPress: () => navigation.replace('EventsWithFriends'),
          },
          { text: 'OK', style: 'cancel' },
        ],
      );
    } catch (e) {
      Alert.alert('Could not accept', e?.message || 'Try again.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Enter invite code</Text>
      <Text style={styles.hint}>
        Your friend shared a single event (not their whole timeline). Paste the code or open the
        timelineapp://share/… link while signed in.
      </Text>

      <Text style={styles.label}>Invite code</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. AB12CD"
        placeholderTextColor="#64748b"
        value={code}
        onChangeText={(t) => setCode(String(t).toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
      />

      <TouchableOpacity style={styles.secondary} onPress={() => lookup(code)} disabled={loadingPreview}>
        <Text style={styles.secondaryText}>{loadingPreview ? 'Looking up…' : 'Look up'}</Text>
      </TouchableOpacity>

      {preview?.error ? <Text style={styles.error}>{preview.error}</Text> : null}
      {preview?.shared ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>{preview.shared.title}</Text>
          <Text style={styles.previewMeta}>
            {preview.shared.date ? new Date(preview.shared.date).toLocaleDateString() : ''}
            {preview.invite?.fromName ? ` · from ${preview.invite.fromName}` : ''}
          </Text>
          {preview.shared.description ? (
            <Text style={styles.previewDesc} numberOfLines={4}>
              {preview.shared.description}
            </Text>
          ) : null}
          <Text style={styles.previewStatus}>Status: {preview.invite?.status || 'pending'}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, accepting && styles.disabled]}
        onPress={handleAccept}
        disabled={accepting}
      >
        {accepting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Accept invite</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.testPath}>
        Two-account test: Account A shares an event and copies the code → Account B opens this screen,
        pastes the code, Accept → check Timeline list and Events with friends.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 48,
    backgroundColor: '#0f1024',
    flexGrow: 1,
  },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  label: { color: '#c4b5fd', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b0764',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    color: '#f8fafc',
    letterSpacing: 3,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondary: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
  },
  secondaryText: { color: '#94a3b8', fontWeight: '600' },
  error: { color: '#f87171', marginTop: 12 },
  preview: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#16182e',
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  previewMeta: { color: '#a5b4fc', marginTop: 6, fontSize: 13 },
  previewDesc: { color: '#94a3b8', marginTop: 10, lineHeight: 20 },
  previewStatus: { color: '#64748b', marginTop: 10, fontSize: 12 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  testPath: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 20 },
});
