import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  SafeAreaView,
} from 'react-native';
import {
  getInviteByCode,
  getSharedEvent,
  acceptInviteByCode,
  rejectInviteByCode,
} from '../services/shareService';
import { parseInviteCodeFromScan } from '../utils/inviteCode';

let CameraView = null;
let useCameraPermissions = null;
if (Platform.OS !== 'web') {
  try {
    const cam = require('expo-camera');
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
  } catch (_) {
    CameraView = null;
    useCameraPermissions = null;
  }
}

function useFallbackCameraPermissions() {
  return [null, async () => ({ granted: false })];
}

function NativeScanButton({ onScanned }) {
  const usePerms = useCameraPermissions || useFallbackCameraPermissions;
  const [permission, requestPermission] = usePerms();
  const [open, setOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const handlingRef = useRef(false);

  const openScanner = async () => {
    if (!CameraView) {
      Alert.alert(
        'Scanner unavailable',
        'Camera scanner is not available on this device. Paste the invite code instead.',
      );
      return;
    }
    handlingRef.current = false;
    setScanned(false);
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result?.granted) {
        Alert.alert(
          'Camera permission needed',
          "Timeline needs the camera to scan your friend's invite QR code. You can also paste the code manually.",
        );
        return;
      }
    }
    setOpen(true);
  };

  const handleBarcode = ({ data }) => {
    if (handlingRef.current || scanned) return;
    const code = parseInviteCodeFromScan(data);
    if (!code) return;
    handlingRef.current = true;
    setScanned(true);
    setOpen(false);
    onScanned(code);
  };

  return (
    <>
      <TouchableOpacity style={styles.scanButton} onPress={openScanner} accessibilityRole="button">
        <Text style={styles.scanButtonText}>Scan QR</Text>
        <Text style={styles.scanButtonSub}>Point at friend's Share screen</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.scannerRoot}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan invite QR</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={styles.scannerClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.scannerHint}>Aim at the QR on your friend's phone</Text>
          {CameraView ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarcode}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Text style={styles.cameraFallbackText}>Camera not available</Text>
            </View>
          )}
          <View style={styles.scannerFrame} pointerEvents="none" />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function WebScanNote() {
  return (
    <View style={styles.webNote}>
      <Text style={styles.webNoteTitle}>Scan QR</Text>
      <Text style={styles.webNoteText}>
        Scan QR works on the phone app (Expo Go / Android). Paste the invite code here on web.
      </Text>
    </View>
  );
}

export default function AcceptInviteScreen({ navigation, route }) {
  const initialCode = String(route.params?.code || '').trim().toUpperCase();
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

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

  const applyScannedCode = (scannedCode) => {
    const normalised = String(scannedCode || '').trim().toUpperCase();
    if (!normalised) {
      Alert.alert(
        'Could not read QR',
        'No invite code found in that QR. Try again or paste the code.',
      );
      return;
    }
    setCode(normalised);
    lookup(normalised);
  };

  const handleAccept = async () => {
    const normalised = String(code || '').trim().toUpperCase();
    if (!normalised) {
      Alert.alert('Enter a code', 'Paste the invite code from your friend, or tap Scan QR.');
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

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(title + (message ? '\n\n' + message : ''));
      return;
    }
    Alert.alert(title, message);
  };

  const confirmAction = (title, message, confirmLabel = 'OK') => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return Promise.resolve(window.confirm(title + (message ? '\n\n' + message : '')));
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleReject = async () => {
    const normalised = String(code || '').trim().toUpperCase();
    if (!normalised) {
      notify('Enter a code', 'Paste the invite code from your friend, or tap Scan QR.');
      return;
    }
    const ok = await confirmAction(
      'Decline invite',
      'Decline this shared event invite? Your friend will see that you declined.',
      'Decline',
    );
    if (!ok) return;
    setRejecting(true);
    try {
      const result = await rejectInviteByCode(normalised);
      notify(
        result?.alreadyDeclined ? 'Already declined' : 'Invite declined',
        result?.notice || 'The creator was notified.',
      );
      setPreview((prev) =>
        prev?.invite
          ? { ...prev, invite: { ...prev.invite, status: 'declined' } }
          : prev,
      );
    } catch (e) {
      notify('Could not decline', e?.message || 'Try again.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Enter invite code</Text>
      <Text style={styles.hint}>
        Your friend shared a single event (not their whole timeline). Scan their Share QR, paste the
        code, or open the timelineapp://share/... link while signed in.
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

      {Platform.OS === 'web' ? (
        <WebScanNote />
      ) : (
        <NativeScanButton onScanned={applyScannedCode} />
      )}

      <TouchableOpacity style={styles.secondary} onPress={() => lookup(code)} disabled={loadingPreview}>
        <Text style={styles.secondaryText}>{loadingPreview ? 'Looking up...' : 'Look up'}</Text>
      </TouchableOpacity>

      {preview?.error ? <Text style={styles.error}>{preview.error}</Text> : null}
      {preview?.shared ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>{preview.shared.title}</Text>
          <Text style={styles.previewMeta}>
            {preview.shared.date ? new Date(preview.shared.date).toLocaleDateString() : ''}
            {preview.invite?.fromEmail
              ? ` - From friend - ${preview.invite.fromEmail}`
              : preview.shared?.createdByEmail
                ? ` - From friend - ${preview.shared.createdByEmail}`
                : preview.invite?.fromName
                  ? ` - from ${preview.invite.fromName}`
                  : ''}
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
        style={[styles.button, (accepting || rejecting) && styles.disabled]}
        onPress={handleAccept}
        disabled={accepting || rejecting}
      >
        {accepting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Accept invite</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.decline, (accepting || rejecting) && styles.disabled]}
        onPress={handleReject}
        disabled={accepting || rejecting}
      >
        <Text style={styles.declineText}>{rejecting ? 'Declining...' : 'Decline invite'}</Text>
      </TouchableOpacity>

      <Text style={styles.testPath}>
        Coffee-table test: Account A shares an event and shows the QR -> Account B opens this screen,
        taps Scan QR, Accept -> check Timeline and Events with friends. Manual code paste still works.
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
  scanButton: {
    marginTop: 14,
    backgroundColor: '#7c3aed',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a78bfa',
  },
  scanButtonText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  scanButtonSub: { color: '#ddd6fe', fontSize: 12, marginTop: 4, fontWeight: '500' },
  webNote: {
    marginTop: 14,
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
    padding: 14,
  },
  webNoteTitle: { color: '#c4b5fd', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  webNoteText: { color: '#94a3b8', fontSize: 13, lineHeight: 19 },
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
  decline: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
  },
  declineText: { color: '#fca5a5', fontSize: 16, fontWeight: '600' },
  testPath: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 20 },
  scannerRoot: { flex: 1, backgroundColor: '#0f1024' },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  scannerTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  scannerClose: { color: '#93c5fd', fontSize: 16, fontWeight: '600' },
  scannerHint: {
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  camera: { flex: 1, marginHorizontal: 16, marginBottom: 24, borderRadius: 16, overflow: 'hidden' },
  cameraFallback: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    backgroundColor: '#1a1b36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFallbackText: { color: '#94a3b8' },
  scannerFrame: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '32%',
    bottom: '28%',
    borderWidth: 2,
    borderColor: 'rgba(167, 139, 250, 0.85)',
    borderRadius: 16,
  },
});
