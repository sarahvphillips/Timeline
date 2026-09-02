import React, { useState } from 'react';
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
} from 'react-native';
import { saveEvent } from '../services/eventService';

function qrImageUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`;
}

export default function AddQrScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [title, setTitle] = useState(existing?.title || '');
  const [qrLink, setQrLink] = useState(existing?.qrLink || '');
  const [note, setNote] = useState(existing?.description || '');
  const [saving, setSaving] = useState(false);

  const preview = qrLink.trim();

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#0f1024',
    flexGrow: 1,
  },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 14, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  note: { minHeight: 80, textAlignVertical: 'top' },
  preview: { alignItems: 'center', marginTop: 24 },
  qr: {
    width: 220,
    height: 220,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  openLink: { color: '#60a5fa', marginTop: 12, fontSize: 15 },
  save: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
