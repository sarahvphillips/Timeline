import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Linking,
  Modal,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { saveEvent } from '../services/eventService';
import { enrichPosterDraft, parsePosterQr } from '../services/posterQr';
import { useTheme } from '../themeContext';

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

function qrImageUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`;
}

export default function AddQrScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const existing = route.params?.event || null;
  const [title, setTitle] = useState(existing?.title || '');
  const [qrLink, setQrLink] = useState(existing?.qrLink || '');
  const [note, setNote] = useState(existing?.description || '');
  const [pastedPoster, setPastedPoster] = useState('');
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const handlingRef = useRef(false);
  const usePerms = useCameraPermissions || useFallbackCameraPermissions;
  const [permission, requestPermission] = usePerms();

  const preview = qrLink.trim();

  const openDraft = async (raw) => {
    const parsed = parsePosterQr(raw);
    if (!parsed) {
      Alert.alert('Empty code', 'That QR did not contain any text.');
      return;
    }
    if (parsed.kind === 'invite') {
      Alert.alert('Friend invite', 'That code is for joining a shared event, not a poster. Open it on Enter invite.');
      navigation.navigate('AcceptInvite', { code: parsed.code });
      return;
    }
    if (parsed.kind === 'profile') {
      Alert.alert('Profile code', 'That QR is a Timeline profile, not an event poster.');
      return;
    }
    setReading(true);
    try {
      const draft = await enrichPosterDraft(parsed);
      navigation.navigate('AddEvent', {
        title: draft.title || 'Poster event',
        description: draft.description || draft.url || '',
        date: draft.date || undefined,
        location: draft.location || '',
        source: 'manual',
      });
    } finally {
      setReading(false);
    }
  };

  const openScanner = async () => {
    if (Platform.OS === 'web' || !CameraView) {
      Alert.alert('Use the phone camera', 'On this browser, paste the poster link or the QR text, then tap Draft an event.');
      return;
    }
    handlingRef.current = false;
    setScanned(false);
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result?.granted) {
        Alert.alert('Camera permission needed', 'Timeline needs the camera to read a poster QR. You can paste the link instead.');
        return;
      }
    }
    setScannerOpen(true);
  };

  const handleBarcode = ({ data }) => {
    if (handlingRef.current || scanned) return;
    handlingRef.current = true;
    setScanned(true);
    setScannerOpen(false);
    openDraft(data);
  };

  const handleSave = async () => {
    if (!preview) {
      Alert.alert('Missing link', 'Paste a URL or text to turn into a QR code.');
      return;
    }
    setSaving(true);
    try {
      await saveEvent({
        id: existing?.id,
        title: title.trim() || preview,
        description: note.trim(),
        date: existing?.date || new Date().toISOString(),
        category: existing?.category || 'other',
        source: 'qr',
        qrLink: preview,
        nextAction: 'none',
      });
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Could not save the QR link.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{existing ? 'Edit QR link' : 'Add QR link'}</Text>
      <Text style={styles.hint}>
        Scan a poster or public page QR to open a draft event. Nothing is saved until you tap Save on that screen.
        Friend invite codes still belong on Enter invite.
      </Text>
      <TouchableOpacity style={styles.scan} onPress={openScanner} disabled={reading}>
        <Text style={styles.scanText}>{reading ? 'Reading poster…' : 'Scan a poster QR'}</Text>
      </TouchableOpacity>
      <Text style={styles.label}>Or paste the poster link / QR text</Text>
      <TextInput
        style={styles.input}
        placeholder="https://venue.example/poetry-night"
        placeholderTextColor="#64748b"
        value={pastedPoster}
        onChangeText={setPastedPoster}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.secondary}
        onPress={() => openDraft(pastedPoster)}
        disabled={reading || !pastedPoster.trim()}
      >
        {reading ? <ActivityIndicator color={colors.blue} /> : <Text style={styles.secondaryText}>Draft an event</Text>}
      </TouchableOpacity>

      <Text style={styles.heading}>Save a QR of your own</Text>
      <Text style={styles.hint}>
        Paste a website, Expo URL, or any text. A QR image is generated so you can scan it later.
      </Text>

      <Text style={styles.label}>Link or text *</Text>
      <TextInput
        style={styles.input}
        placeholder="https://…"
        placeholderTextColor="#64748b"
        value={qrLink}
        onChangeText={setQrLink}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Title (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Expo Go, event page"
        placeholderTextColor="#64748b"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.note]}
        placeholder="Why you saved this QR…"
        placeholderTextColor="#64748b"
        value={note}
        onChangeText={setNote}
        multiline
      />

      {preview ? (
        <View style={styles.preview}>
          <Image source={{ uri: qrImageUrl(preview) }} style={styles.qr} />
          <TouchableOpacity onPress={() => Linking.openURL(preview).catch(() => {})}>
            <Text style={styles.openLink}>Open link</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.save} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save QR to timeline'}</Text>
      </TouchableOpacity>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerRoot}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan poster QR</Text>
            <TouchableOpacity onPress={() => setScannerOpen(false)} hitSlop={12}>
              <Text style={styles.scannerClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Aim at the code on the poster. This does not join a friend invite.</Text>
          {CameraView ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarcode}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: c.bg,
    flexGrow: 1,
  },
  heading: { color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  hint: { color: c.faint, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  label: { color: c.faint, fontSize: 14, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: c.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
  },
  note: { minHeight: 80, textAlignVertical: 'top' },
  preview: { alignItems: 'center', marginTop: 24 },
  qr: {
    width: 220,
    height: 220,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  openLink: { color: c.blueSoft, marginTop: 12, fontSize: 15 },
  save: {
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  scan: {
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  scanText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: {
    borderWidth: 1,
    borderColor: c.blue,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  secondaryText: { color: c.text, fontWeight: '700', fontSize: 16 },
  scannerRoot: { flex: 1, backgroundColor: c.bg, padding: 16 },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scannerTitle: { color: c.text, fontSize: 20, fontWeight: '800' },
  scannerClose: { color: c.blueSoft, fontWeight: '700', fontSize: 16 },
  camera: { flex: 1, marginTop: 12, borderRadius: 16, overflow: 'hidden' },
});
}

