import React, { useEffect, useState, useMemo } from 'react';
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
import { getEventCategories } from '../services/profileService';
import ImageAttachField from '../components/ImageAttachField';
import LabelPicker from '../components/LabelPicker';
import { useTheme } from '../themeContext';
import DateField from '../components/DateField';

export default function AddPoemScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
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
  const [shareCaption, setShareCaption] = useState(existing?.shareCaption || '');
  const [labels, setLabels] = useState(existing?.labels || []);
  const [saving, setSaving] = useState(false);
  const [eventCats, setEventCats] = useState(CATEGORIES);

  useEffect(() => {
    getEventCategories()
      .then((list) => {
        if (Array.isArray(list) && list.length) setEventCats(list);
      })
      .catch(() => {});
  }, []);

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
        shareCaption: shareCaption.trim() || undefined,
        labels,
        nextAction: 'none',
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save the poem', e?.message || 'Try again. If the photos are very large, remove one and save again.');
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

        <Text style={styles.label}>Date</Text>
        <DateField value={date} onChange={setDate} />

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

        <Text style={styles.label}>Sharing text</Text>
        <Text style={styles.hint}>
          Caption for X, Instagram, Facebook or email. Leave blank to use the title and the first lines of the poem.
        </Text>
        <TextInput
          style={[styles.input, styles.shareBox]}
          placeholder="Optional post text"
          placeholderTextColor="#64748b"
          value={shareCaption}
          onChangeText={setShareCaption}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.save} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : existing ? 'Update poem' : 'Add poem'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 20, paddingBottom: 40 },
  heading: { color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  label: { color: c.faint, fontSize: 14, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: c.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
  },
  poem: { minHeight: 180 },
  shareBox: { minHeight: 100 },
  hint: { color: c.faint, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipText: { color: c.faint, fontSize: 13 },
  chipOn: { borderColor: c.spine, backgroundColor: '#3b0764' },
  chipOnText: { color: c.muted, fontWeight: '600' },
  save: {
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
}

