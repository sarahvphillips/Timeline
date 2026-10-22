import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateField from '../components/DateField';
import PhotoView from '../components/PhotoView';
import TurnPhotoButton from '../components/TurnPhotoButton';
import ClipVideo from '../components/ClipVideo';
import { pickClipFromGallery } from '../services/imagePicker';
import { saveEvent } from '../services/eventService';
import { describeCapture } from '../services/clipTime';
import { useTheme } from '../themeContext';

const STREAMS = [
  { id: 'tapo', label: 'Tapo camera' },
  { id: 'usb', label: 'USB camera' },
  { id: 'screen', label: 'Screen recording' },
  { id: 'other', label: 'Other' },
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fileWhen(file) {
  if (file.capturedAt && !file.override) return new Date(file.capturedAt);
  const hh = Math.min(23, parseInt(file.hour, 10) || 0);
  const mm = Math.min(59, parseInt(file.minute, 10) || 0);
  const [y, m, d] = String(file.date || '').split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const when = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(when.getTime()) ? null : when;
}
function pad2(value) {
  const n = Math.max(0, parseInt(String(value || '0'), 10) || 0);
  return String(n).padStart(2, '0');
}

function streamLabel(stream, otherName) {
  if (stream === 'other') return String(otherName || '').trim() || 'Other';
  return STREAMS.find((row) => row.id === stream)?.label || 'Clip';
}

function clipTitle(file) {
  const name = streamLabel(file.stream, file.otherName);
  const fileName = String(file.filename || '').trim();
  return fileName ? `${name} · ${fileName}` : name;
}

export default function AddGalleryClipScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const existing = route.params?.event || null;
  const [note, setNote] = useState(existing?.description || '');
  const [files, setFiles] = useState(() => {
    if (!existing) return [];
    const video = !!existing.videoUri && !existing.imageUri;
    const when = existing.date ? new Date(existing.date) : null;
    const known = when && !Number.isNaN(when.getTime());
    return [
      {
        id: existing.id,
        uri: existing.imageUri || existing.videoUri || '',
        rotation: Number(existing.imageRotation) || 0,
        filename: existing.clipFileName || '',
        kind: existing.clipKind || (video ? 'video' : 'image'),
        stream: existing.clipStream || 'tapo',
        otherName: existing.clipStream === 'other' ? existing.clipStreamLabel || '' : '',
        capturedAt: known ? when.toISOString() : '',
        capturedFrom: existing.clipTimeSource || (known ? 'exif' : ''),
        capturedLabel: describeCapture(existing.clipTimeSource || (known ? 'exif' : '')),
        override: false,
        date: known ? String(existing.date).slice(0, 10) : todayIso(),
        hour: known ? pad2(when.getHours()) : '12',
        minute: known ? pad2(when.getMinutes()) : '00',
      },
    ];
  });
  const [saving, setSaving] = useState(false);

  const addFromGallery = async () => {
    const picked = await pickClipFromGallery();
    if (!picked?.uri) return;
    setFiles((list) => [
      ...list,
      {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        uri: picked.uri,
        filename: picked.filename || '',
        kind: picked.kind === 'video' ? 'video' : 'image',
        stream: 'tapo',
        otherName: '',
        capturedAt: picked.capturedAt || '',
        capturedFrom: picked.capturedFrom || '',
        capturedLabel: picked.capturedLabel || '',
        override: !picked.capturedAt,
        date: picked.capturedAt ? String(picked.capturedAt).slice(0, 10) : todayIso(),
        hour: '12',
        minute: '00',
      },
    ]);
  };

  const save = async () => {
    if (!files.length) {
      Alert.alert('Choose a file', 'Add at least one photo or video from the gallery.');
      return;
    }
    const missing = files.find((file) => !fileWhen(file));
    if (missing) {
      Alert.alert('Missing recording time', 'One file has no time written in it. Set that file’s time, or remove it.');
      return;
    }
    setSaving(true);
    try {
      for (const file of files) {
        const when = fileWhen(file);
        const label = streamLabel(file.stream, file.otherName);
        const payload = {
          title: clipTitle(file),
          description: note,
          date: when.toISOString(),
          category: 'personal',
          source: 'clip',
          clipStream: file.stream,
          clipStreamLabel: label,
          clipFileName: file.filename || '',
          clipKind: file.kind,
          clipTimeSource: file.override ? 'manual' : file.capturedFrom || 'manual',
          imageUri: file.kind === 'image' ? file.uri : undefined,
          imageRotation: file.kind === 'image' ? Number(file.rotation) || 0 : undefined,
          videoUri: file.kind === 'video' ? file.uri : undefined,
        };
        if (existing && file.id === existing.id) payload.id = existing.id;
        await saveEvent(payload);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Each file is placed at the time written in the recording. A Tapo clip and a screen recording from the same minute stay separate because the stream is different.
      </Text>
      <TextInput
        style={styles.note}
        placeholder="Note, optional"
        placeholderTextColor={colors.faint}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <TouchableOpacity style={styles.add} onPress={addFromGallery}>
        <Text style={styles.addText}>Add from gallery</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        {Platform.OS === 'web'
          ? 'On the laptop, photos are kept in the app. A video link from the browser may only last for this visit.'
          : 'On the phone, photos and videos are copied into Timeline. The gallery original is left as it is.'}
      </Text>
      {files.map((file) => (
        <View key={file.id} style={styles.card}>
          {file.kind === 'image' && file.uri ? (
            <View>
              <PhotoView uri={file.uri} turn={file.rotation || 0} style={styles.thumb} resizeMode="cover" />
              <TurnPhotoButton
                uri={file.uri}
                turn={file.rotation || 0}
                onTurned={(degrees) =>
                  setFiles((list) => list.map((row) => (row.id === file.id ? { ...row, rotation: degrees } : row)))
                }
              />
            </View>
          ) : (
            <ClipVideo uri={file.uri} />
          )}
          {file.capturedAt && !file.override ? (
            <View>
              <Text style={styles.when}>{formatStamp(file.capturedAt)}</Text>
              <Text style={styles.hint}>{file.capturedLabel || 'Time written in the file'}</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.hint}>
                {file.capturedAt
                  ? 'Using a time you set, instead of the time in the file.'
                  : `No recording time was found${file.filename ? ` in “${file.filename}”` : ''}. Set it for this file only.`}
              </Text>
              <DateField
                value={file.date}
                onChange={(value) =>
                  setFiles((list) => list.map((row) => (row.id === file.id ? { ...row, date: value, override: true } : row)))
                }
              />
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.time}
                  value={file.hour}
                  onChangeText={(t) =>
                    setFiles((list) =>
                      list.map((row) =>
                        row.id === file.id ? { ...row, hour: t.replace(/[^\d]/g, '').slice(0, 2), override: true } : row,
                      ),
                    )
                  }
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="HH"
                  placeholderTextColor={colors.faint}
                />
                <Text style={styles.colon}>:</Text>
                <TextInput
                  style={styles.time}
                  value={file.minute}
                  onChangeText={(t) =>
                    setFiles((list) =>
                      list.map((row) =>
                        row.id === file.id ? { ...row, minute: t.replace(/[^\d]/g, '').slice(0, 2), override: true } : row,
                      ),
                    )
                  }
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor={colors.faint}
                />
              </View>
            </View>
          )}
          {file.filename ? <Text style={styles.hint}>{file.filename}</Text> : null}
          <View style={styles.chips}>
            {STREAMS.map((stream) => {
              const on = file.stream === stream.id;
              return (
                <TouchableOpacity
                  key={stream.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() =>
                    setFiles((list) => list.map((row) => (row.id === file.id ? { ...row, stream: stream.id } : row)))
                  }
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{stream.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {file.stream === 'other' ? (
            <TextInput
              style={styles.other}
              placeholder="Name this stream"
              placeholderTextColor={colors.faint}
              value={file.otherName}
              onChangeText={(text) =>
                setFiles((list) => list.map((row) => (row.id === file.id ? { ...row, otherName: text } : row)))
              }
            />
          ) : null}
          <TouchableOpacity
            onPress={() => setFiles((list) => list.filter((row) => row.id !== file.id))}
          >
            <Text style={styles.remove}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save on timeline</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48 },
    intro: { color: c.faint, fontSize: 14, lineHeight: 20, marginBottom: 12 },
    label: { color: c.text, fontWeight: '700', marginBottom: 6 },
    timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 10 },
    time: {
      width: 64,
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      color: c.text,
      borderRadius: 10,
      textAlign: 'center',
      paddingVertical: 10,
      fontSize: 18,
    },
    colon: { color: c.text, fontSize: 20, marginHorizontal: 8 },
    note: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      color: c.text,
      borderRadius: 10,
      minHeight: 64,
      padding: 12,
      marginBottom: 12,
    },
    add: {
      borderWidth: 1,
      borderColor: c.blue,
      borderRadius: 10,
      alignItems: 'center',
      paddingVertical: 12,
    },
    addText: { color: c.blue, fontWeight: '700' },
    hint: { color: c.faint, fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 12 },
    when: { color: c.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
    card: {
      backgroundColor: c.card,
      borderColor: c.cardBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    thumb: { width: '100%', height: 160, borderRadius: 8, marginBottom: 8 },
    video: { color: c.text, marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    chipOn: { backgroundColor: c.blue, borderColor: c.blue },
    chipText: { color: c.text, fontSize: 13 },
    chipTextOn: { color: '#fff', fontWeight: '700' },
    other: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: c.cardBorder,
      color: c.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    remove: { color: c.danger || '#dc2626', marginTop: 8 },
    save: {
      backgroundColor: c.blue,
      borderRadius: 10,
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: 8,
    },
    saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  });
}
