import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  createEventShare,
  buildShareLink,
  qrImageUrl,
  copyTextToClipboard,
  shareInviteViaOs,
} from '../services/shareService';

export default function ShareEventScreen({ navigation, route }) {
  const event = route.params?.event || null;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(route.params?.code || '');
  const [link, setLink] = useState(route.params?.link || '');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (route.params?.code && route.params?.link) {
        setCode(route.params.code);
        setLink(route.params.link);
        setLoading(false);
        return;
      }
      if (!event?.id) {
        setError('Save the event first, then open Share with a friend.');
        setLoading(false);
        return;
      }
      if (event.shareId && event.isShared) {
        // Try to reuse an existing pending invite by scanning is hard;
        // create a fresh invite code for another friend.
      }
      try {
        const result = await createEventShare(event);
        if (cancelled) return;
        setCode(result.code);
        setLink(result.link);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || 'Could not create invite.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [event?.id]);

  const handleCopyCode = async () => {
    setBusy(true);
    try {
      const ok = await copyTextToClipboard(code);
      Alert.alert(ok ? 'Copied' : 'Invite code', ok ? `Code ${code} copied.` : `Invite code: ${code}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLink = async () => {
    setBusy(true);
    try {
      const ok = await copyTextToClipboard(link || buildShareLink(code));
      Alert.alert(ok ? 'Copied' : 'Invite link', ok ? 'Share link copied.' : link || buildShareLink(code));
    } finally {
      setBusy(false);
    }
  };

  const handleOsShare = async () => {
    setBusy(true);
    try {
      await shareInviteViaOs(code, event?.title);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Creating invite…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const inviteUrl = link || buildShareLink(code);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Share with a friend</Text>
      <Text style={styles.hint}>
        Per-event invite only — not your whole timeline. Your friend enters this code (or opens the link)
        on their Timeline account. It appears for them after they accept.
      </Text>

      <Text style={styles.eventTitle}>{event?.title || 'Event'}</Text>

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Invite code</Text>
        <Text style={styles.code}>{code}</Text>
      </View>

      <Text style={styles.linkLabel}>Link</Text>
      <Text style={styles.link} selectable>
        {inviteUrl}
      </Text>

      <View style={styles.qrWrap}>
        <Image source={{ uri: qrImageUrl(inviteUrl, 220) }} style={styles.qr} />
        <Text style={styles.qrHint}>Scan to open the invite (deep link)</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleCopyCode} disabled={busy}>
        <Text style={styles.buttonText}>Copy code</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleCopyLink} disabled={busy}>
        <Text style={styles.buttonText}>Copy link</Text>
      </TouchableOpacity>
      {Platform.OS !== 'web' ? (
        <TouchableOpacity style={styles.button} onPress={handleOsShare} disabled={busy}>
          <Text style={styles.buttonText}>Share via SMS / email / apps</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.button, styles.ghost]} onPress={handleOsShare} disabled={busy}>
          <Text style={styles.ghostText}>Share (browser share sheet if available)</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, styles.ghost]}
        onPress={() => navigation.navigate('AcceptInvite')}
      >
        <Text style={styles.ghostText}>I have a code to accept</Text>
      </TouchableOpacity>

      <Text style={styles.testPath}>
        Test path: Account A creates this invite → log out → Account B signs in → Home → Enter invite code
        (or Events with friends → Enter code) → paste {code} → Accept. Both see the shared point under
        Events with friends.
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
  center: {
    flex: 1,
    backgroundColor: '#0f1024',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: { color: '#94a3b8', marginTop: 12 },
  errorText: { color: '#f87171', textAlign: 'center', marginBottom: 16 },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  eventTitle: { color: '#c4b5fd', fontSize: 16, fontWeight: '600', marginBottom: 16 },
  codeBox: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: { color: '#a5b4fc', fontSize: 13, marginBottom: 8 },
  code: { color: '#f8fafc', fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  linkLabel: { color: '#94a3b8', fontSize: 13, marginBottom: 6 },
  link: { color: '#60a5fa', fontSize: 14, marginBottom: 20 },
  qrWrap: { alignItems: 'center', marginBottom: 20 },
  qr: { width: 220, height: 220, backgroundColor: '#fff', borderRadius: 8 },
  qrHint: { color: '#64748b', fontSize: 12, marginTop: 8 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#475569',
  },
  ghostText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  testPath: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
});
