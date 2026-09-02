import React, { useState } from 'react';
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
import ImageAttachField from '../components/ImageAttachField';

const DEFAULT_LABELS = [
  'Nature', 'Love', 'Family', 'Work', 'Norse', 'Greek',
  'Space', 'Programming', 'Life problems', 'Money',
];

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

  const toggleLabel = (lab) => {
    setLabels((prev) =>
      prev.includes(lab) ? prev.filter((l) => l !== lab) : [...prev, lab]
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
          {CATEGORIES.map((cat) => {
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

        <Text style={styles.label}>Labels</Text>
        <View style={styles.row}>
          {DEFAULT_LABELS.map((lab) => {
            const selected = labels.includes(lab);
            return (
              <TouchableOpacity
                key={lab}
                style={[styles.chip, selected && styles.chipOn]}
                onPress={() => toggleLabel(lab)}
              >
                <Text style={[styles.chipText, selected && styles.chipOnText]}>{lab}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

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
