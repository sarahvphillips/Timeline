import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { saveEvent, CATEGORIES } from '../services/eventService';
import { importPoemCards, poemBulkAlreadyImported, titleFromSlug } from '../services/poemCardImport';
import { pickFromFile } from '../services/imagePicker';
import { getEventCategories } from '../services/profileService';
import ImageAttachField from '../components/ImageAttachField';
import LabelPicker from '../components/LabelPicker';

export default function AddPoemScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [title, setTitle] = useState(existing?.title || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [date, setDate] = useState(
    existing?.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState(existing?.category || 'hobby');
  const [collectionName, setCollectionName] = useState(existing?.collectionName || '');
  const [coverPhotoNote, setCoverPhotoNote] = useState(existing?.coverPhotoNote || '');
  const [photoNote, setPhotoNote] = useState(existing?.photoNote || '');
  const [coverImageUri, setCoverImageUri] = useState(existing?.coverImageUri || '');
  const [imageUri, setImageUri] = useState(existing?.imageUri || '');
  const [labels, setLabels] = useState(existing?.labels || []);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  const [eventCats, setEventCats] = useState(CATEGORIES);

  useEffect(() => {
    getEventCategories()
      .then((list) => {
        if (Array.isArray(list) && list.length) setEventCats(list);
      })
      .catch(() => {});
    poemBulkAlreadyImported().then(setBulkDone).catch(() => {});
  }, []);

  const importCards = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await importPoemCards();
      if (result.cancelled) return;
      if (result.matched >= result.total) setBulkDone(true);
      const placed = result.added + result.updated;
      Alert.alert(
        'Poem cards',
        result.matched >= result.total
          ? `Saved ${placed} poem card${placed === 1 ? '' : 's'} on this device, dated 23 Sep 2026. ${result.skipped} were already stored. The pictures are kept with the app, not as Drive links.`
          : `Found ${result.matched} of ${result.total} cards in that folder. Choose the folder Full poem cards 2026-09-23 so the rest can be stored too.`
      );
    } catch (e) {
      Alert.alert('Could not import', e?.message || 'Try again while signed in.');
    } finally {
      setImporting(false);
    }
  };

  const importOnePoem = async () => {
    const picked = await pickFromFile();
    if (!picked || !picked.uri) return;
    const raw = String(picked.filename || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_\s]+/g, '-');
    setTitle(titleFromSlug(raw) || raw);
    setImageUri(picked.uri);
    setCategory('hobby');
    setCollectionName('Poem Compilation');
    setLabels(['Poem', '#poem']);
    setPhotoNote('Stored with the app.');
    Alert.alert(
      'One poem',
      'The picture is stored on this device. Check the title and the date, then tap Save.'
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a poem title.');
      return;
    }
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    try {
      await saveEvent({
        id: existing?.id,
        title: title.trim(),
        description: description.trim(),
        date: parsed.toISOString(),
        category,
        source: 'hobby',
        hobbyType: 'poetry',
        collectionName: collectionName.trim() || undefined,
        coverImageUri: coverImageUri || undefined,
        coverPhotoNote: coverPhotoNote.trim() || undefined,
        imageUri: imageUri || undefined,
        photoNote: photoNote.trim() || undefined,
        labels,
        nextAction: 'none',
      });
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Could not save the poem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{existing ? 'Edit poem' : 'Add poem'}</Text>
        {!existing ? (
          <TouchableOpacity
            style={styles.importBtn}
            onPress={bulkDone ? importOnePoem : importCards}
            disabled={importing}
          >
            <Text style={styles.importText}>
              {importing
                ? 'Storing poem cards on this device…'
                : bulkDone
                  ? 'Import one poem from Google Drive'
                  : 'Add the 60 poem cards once'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {!existing ? (
          <Text style={styles.importHint}>
            {bulkDone
              ? 'One poem at a time. On the phone, Google Drive is in the file list. The picture is stored on this device. Set the date, then tap Save.'
              : 'One-off test load. Choose the folder Full poem cards 2026-09-23. Each card is dated 23 Sep 2026, the day those files were created, and the picture is stored on this device.'}
          </Text>
        ) : null}

        <Text style={styles.label}>Poem title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Rain over Rainham"
          placeholderTextColor="#64748b"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholderTextColor="#64748b"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.row}>
          {eventCats.map((cat) => {
            const selected = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.chip, selected && { borderColor: cat.color, backgroundColor: cat.color + '33' }]}
                onPress={() => setCategory(cat.id)}
              >
                <Text style={[styles.chipText, selected && { color: cat.color }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Album / book name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Rainham Nights"
          placeholderTextColor="#64748b"
          value={collectionName}
          onChangeText={setCollectionName}
        />

        <ImageAttachField
          label="Cover photo"
          uri={coverImageUri}
          onChange={(picked) => setCoverImageUri(picked && picked.uri ? picked.uri : '')}
          caption={coverPhotoNote}
          onCaptionChange={setCoverPhotoNote}
          captionPlaceholder="Optional cover caption"
          hint="Camera, gallery (Google Photos on Android), or a file."
        />

        <ImageAttachField
          label="Photo for this poem"
          uri={imageUri}
          onChange={(picked) => setImageUri(picked && picked.uri ? picked.uri : '')}
          caption={photoNote}
          onCaptionChange={setPhotoNote}
          captionPlaceholder="Optional caption"
        />

        <LabelPicker value={labels} onChange={setLabels} />

        <Text style={styles.label}>Poem text</Text>
        <TextInput
          style={[styles.input, styles.poem]}
          placeholder="Write or paste your poem here?"
          placeholderTextColor="#64748b"
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.save} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving?' : existing ? 'Update poem' : 'Add poem'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 40 },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  importBtn: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  importText: { color: '#c4b5fd', fontWeight: '700' },
  importHint: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 14, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  poem: { minHeight: 180 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipText: { color: '#94a3b8', fontSize: 13 },
  chipOn: { borderColor: '#8b5cf6', backgroundColor: '#3b0764' },
  chipOnText: { color: '#c4b5fd', fontWeight: '600' },
  save: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
