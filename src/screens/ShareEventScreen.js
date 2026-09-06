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
  getSharedEvent,
  formatRecentLeftNotice,
  clearRecentLeftNotice,
  formatRecentSuggestionNotice,
  clearRecentSuggestionNotice,
  pendingEditSuggestions,
  countPendingSuggestions,
  approveEditSuggestion,
  declineEditSuggestion,
} from '../services/shareService';
import { auth } from '../services/firebase';

export default function ShareEventScreen({ navigation, route }) {
  const event = route.params?.event || null;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(route.params?.code || '');
  const [link, setLink] = useState(route.params?.link || '');
  const [error, setError] = useState(null);
  const [leftNotice, setLeftNotice] = useState('');
  const [suggestionNotice, setSuggestionNotice] = useState('');
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [resolvingId, setResolvingId] = useState(null);
  const [shareId, setShareId] = useState(event?.shareId || null);


  const applySharedMeta = (shared) => {
    if (!shared) return;
    const isCreator = !shared.createdByUid || shared.createdByUid === auth.currentUser?.uid;
    if (!isCreator) return;
    const left = formatRecentLeftNotice(shared);
    if (left) setLeftNotice(left);
    const sug = formatRecentSuggestionNotice(shared);
    if (sug) setSuggestionNotice(sug);
    setPendingSuggestions(pendingEditSuggestions(shared));
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (route.params?.code && route.params?.link) {
        setCode(route.params.code);
        setLink(route.params.link);
        if (event?.shareId) {
          setShareId(event.shareId);
          try {
            const shared = await getSharedEvent(event.shareId);
            applySharedMeta(shared);
          } catch (_) {}
        }
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
        if (result.shareId) setShareId(result.shareId);
        const shared = result.shared || (result.shareId ? await getSharedEvent(result.shareId) : null);
        applySharedMeta(shared);
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


  const refreshSuggestions = async (id) => {
    const sid = id || shareId;
    if (!sid) return;
    try {
      const shared = await getSharedEvent(sid);
      applySharedMeta(shared);
      if (!countPendingSuggestions(shared)) {
        setSuggestionNotice('');
      }
    } catch (_) {}
  };

  const handleApprove = async (suggestionId) => {
    if (!shareId || resolvingId) return;
    const ok =
      Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm
        ? window.confirm('Approve this note and append it to the shared event description?')
        : await new Promise((resolve) => {
            Alert.alert('Approve suggestion', 'Append this note to the shared event description?', [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Approve', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    setResolvingId(suggestionId);
    try {
      await approveEditSuggestion(shareId, suggestionId);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Approved\n\nNote added to the shared event.');
      } else {
        Alert.alert('Approved', 'Note added to the shared event.');
      }
      await refreshSuggestions(shareId);
    } catch (e) {
      const msg = e?.message || 'Could not approve.';
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Could not approve\n\n' + msg);
      } else {
        Alert.alert('Could not approve', msg);
      }
    } finally {
      setResolvingId(null);
    }
  };

  const handleDecline = async (suggestionId) => {
    if (!shareId || resolvingId) return;
    const ok =
      Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm
        ? window.confirm('Decline this suggested note?')
        : await new Promise((resolve) => {
            Alert.alert('Decline suggestion', 'Decline this suggested note?', [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Decline', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    setResolvingId(suggestionId);
    try {
      await declineEditSuggestion(shareId, suggestionId);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Declined\n\nSuggestion was declined.');
      } else {
        Alert.alert('Declined', 'Suggestion was declined.');
      }
      await refreshSuggestions(shareId);
    } catch (e) {
      const msg = e?.message || 'Could not decline.';
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Could not decline\n\n' + msg);
      } else {
        Alert.alert('Could not decline', msg);
      }
    } finally {
      setResolvingId(null);
    }
  };

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
        Per-event invite only - not your whole timeline. Your friend enters this code (or opens the link)
        on their Timeline account. It appears for them after they accept.
      </Text>

      <Text style={styles.eventTitle}>{event?.title || 'Event'}</Text>

      {leftNotice ? (
        <View style={styles.leftBanner}>
          <Text style={styles.leftBannerText}>{leftNotice}</Text>
          <TouchableOpacity
            onPress={async () => {
              try {
                if (shareId) await clearRecentLeftNotice(shareId);
              } catch (_) {}
              setLeftNotice('');
            }}
          >
            <Text style={styles.leftDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {suggestionNotice || pendingSuggestions.length ? (
        <View style={styles.sugBanner}>
          <Text style={styles.sugBannerText}>
            {suggestionNotice ||
              (pendingSuggestions.length === 1
                ? '1 pending note suggestion'
                : pendingSuggestions.length + ' pending note suggestions')}
          </Text>
          {suggestionNotice ? (
            <TouchableOpacity
              onPress={async () => {
                try {
                  if (shareId) await clearRecentSuggestionNotice(shareId);
                } catch (_) {}
                setSuggestionNotice('');
              }}
            >
              <Text style={styles.leftDismiss}>Dismiss banner</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {pendingSuggestions.length ? (
        <View style={styles.sugList}>
          <Text style={styles.sugListTitle}>
            Pending suggestions ({pendingSuggestions.length})
          </Text>
          {pendingSuggestions.map((sug) => (
            <View key={sug.id} style={styles.sugCard}>
              <Text style={styles.sugFrom}>
                From{' '}
                {(sug.fromEmail && String(sug.fromEmail)) ||
                  sug.fromDisplayName ||
                  'friend'}
              </Text>
              <Text style={styles.sugNote}>{sug.note}</Text>
              <View style={styles.sugActions}>
                <TouchableOpacity
                  style={[styles.sugApprove, resolvingId && styles.sugDisabled]}
                  onPress={() => handleApprove(sug.id)}
                  disabled={!!resolvingId}
                >
                  <Text style={styles.sugApproveText}>
                    {resolvingId === sug.id ? '…' : 'Approve'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sugDecline, resolvingId && styles.sugDisabled]}
                  onPress={() => handleDecline(sug.id)}
                  disabled={!!resolvingId}
                >
                  <Text style={styles.sugDeclineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Invite code</Text>
        <Text style={styles.code}>{code}</Text>
      </View>

      <Text style={styles.linkLabel}>Link</Text>
      <Text style={styles.link} selectable>
        {inviteUrl}
      </Text>

      <View style={styles.qrWrap}>
        <Image source={{ uri: qrImageUrl(inviteUrl, 300) }} style={styles.qr} />
        <Text style={styles.qrHint}>Large QR for coffee-table scan - friend taps Scan QR on Enter invite</Text>
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
        Test path: Account A creates this invite -> log out -> Account B signs in -> Home -> Enter invite code
        (or Events with friends -> Enter code) -> paste {code} -> Accept. Both see the shared point under
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
  qr: { width: 300, height: 300, backgroundColor: '#fff', borderRadius: 12 },
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
  leftBanner: {
    backgroundColor: '#422006',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  leftBannerText: { color: '#fde68a', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  leftDismiss: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  sugBanner: {
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  sugBannerText: { color: '#bfdbfe', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  sugList: { marginBottom: 16 },
  sugListTitle: { color: '#c4b5fd', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sugCard: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    marginBottom: 10,
  },
  sugFrom: { color: '#94a3b8', fontSize: 12, marginBottom: 6 },
  sugNote: { color: '#f8fafc', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  sugActions: { flexDirection: 'row', gap: 10 },
  sugApprove: {
    flex: 1,
    backgroundColor: '#166534',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sugApproveText: { color: '#bbf7d0', fontWeight: '700' },
  sugDecline: {
    flex: 1,
    backgroundColor: '#450a0a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  sugDeclineText: { color: '#fca5a5', fontWeight: '700' },
  sugDisabled: { opacity: 0.6 },
});
