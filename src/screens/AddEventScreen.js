import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import {
  saveEvent,
  CATEGORIES,
  NEXT_ACTIONS,
  HOBBY_TYPES,
  buildGrokReplyPrompt,
} from '../services/eventService';

export default function AddEventScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const isEditing = !!existing;
  const fromEmail = route.params?.fromEmail || route.params?.source === 'email' || false;
  const fromHobby = route.params?.fromHobby || false;

  const initialSource = existing?.source
    || route.params?.source
    || (fromHobby ? 'hobby' : fromEmail ? 'email' : 'manual');

  const paramDate = route.params?.date
    ? String(route.params.date).slice(0, 10)
    : null;

  const [title, setTitle] = useState(existing?.title || route.params?.title || '');
  const [description, setDescription] = useState(existing?.description || route.params?.description || '');
  const [emailFrom, setEmailFrom] = useState(existing?.emailFrom || route.params?.emailFrom || '');
  const [date, setDate] = useState(
    existing?.date
      ? existing.date.slice(0, 10)
      : paramDate || new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState(
    existing?.category || (fromHobby ? 'hobby' : 'personal')
  );
  const [nextAction, setNextAction] = useState(existing?.nextAction || 'none');
  const [source, setSource] = useState(initialSource);
  const [hobbyType, setHobbyType] = useState(existing?.hobbyType || 'poetry');
  const [audioNote, setAudioNote] = useState(existing?.audioNote || '');
  const [readingProgress, setReadingProgress] = useState(existing?.readingProgress || '');
  const [collectionName, setCollectionName] = useState(existing?.collectionName || '');
  const [coverPhotoNote, setCoverPhotoNote] = useState(existing?.coverPhotoNote || '');
  const [photoNote, setPhotoNote] = useState(existing?.photoNote || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (route.params?.event) return;
    const p = route.params || {};
    if (!p.fromEmail && p.source !== 'email' && !p.shareKey) return;
    if (typeof p.title === 'string') setTitle(p.title);
    if (typeof p.description === 'string') setDescription(p.description);
    if (typeof p.emailFrom === 'string') setEmailFrom(p.emailFrom);
    if (p.date) setDate(String(p.date).slice(0, 10));
    if (p.source) setSource(p.source);
  }, [route.params?.shareKey, route.params?.title, route.params?.description, route.params?.emailFrom, route.params?.date]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert(
        'Missing title',
        source === 'hobby'
          ? 'Please enter a title (e.g. poem title or song name).'
          : 'Please enter a title for the event.'
      );
      return;
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      Alert.alert('Invalid date', 'Please use the format YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const saved = {
        id: existing?.id,
        title: title.trim(),
        description: description.trim(),
        date: parsed.toISOString(),
        category: category || (source === 'hobby' ? 'hobby' : 'personal'),
        source,
        nextAction,
        emailFrom: emailFrom.trim() || undefined,
        hobbyType: source === 'hobby' ? hobbyType : undefined,
        audioNote:
          source === 'hobby' && (hobbyType === 'singing' || hobbyType === 'music')
            ? audioNote.trim() || undefined
            : undefined,
        readingProgress:
          source === 'hobby' && hobbyType === 'reading'
            ? readingProgress.trim() || undefined
            : undefined,
        collectionName:
          source === 'hobby' && hobbyType === 'poetry'
            ? collectionName.trim() || undefined
            : undefined,
        coverPhotoNote:
          source === 'hobby' && hobbyType === 'poetry'
            ? coverPhotoNote.trim() || undefined
            : undefined,
        photoNote:
          source === 'hobby'
            ? photoNote.trim() || undefined
            : undefined,
      };
      await saveEvent(saved);

      if (nextAction === 'ask_grok_reply') {
        const prompt = buildGrokReplyPrompt(saved);
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(prompt);
            Alert.alert(
              'Saved + prompt copied',
              'Event saved. A Grok reply prompt has been copied to your clipboard.'
            );
          } catch {
            Alert.alert('Event saved', 'Open Grok to draft a reply using the email details.');
          }
        }
      }

      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Could not save the event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const descriptionPlaceholder = () => {
    if (source === 'email') return 'Paste a short part of the email or your notes…';
    if (source === 'hobby') {
      if (hobbyType === 'poetry') return 'Write or paste your poem here…';
      if (hobbyType === 'singing') return 'Description of the recording, lyrics notes, mood…';
      if (hobbyType === 'music') return 'Piece name, instrument notes, practice notes…';
      if (hobbyType === 'reading') return 'Thoughts on the book, favourite lines…';
      return 'Notes about this hobby…';
    }
    return 'Optional details…';
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>
          {source === 'hobby'
            ? isEditing
              ? 'Edit hobby'
              : 'Add hobby'
            : source === 'email'
              ? 'Add email as event'
              : isEditing
                ? 'Edit event'
                : 'New event'}
        </Text>
        <Text style={styles.intro}>
          Choose a type, add a title and date, then save it onto your timeline.
        </Text>

        <Text style={styles.label}>Source</Text>
        <View style={styles.row}>
          {[
            { id: 'manual', label: 'Manual' },
            { id: 'email', label: 'From email' },
            { id: 'hobby', label: 'Hobby' },
          ].map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.sourceChip, source === s.id && styles.sourceSelected]}
              onPress={() => {
                setSource(s.id);
                if (s.id === 'hobby') setCategory('hobby');
              }}
            >
              <Text style={[styles.sourceText, source === s.id && styles.sourceTextSelected]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {source === 'hobby' && (
          <>
            <Text style={styles.label}>Hobby type</Text>
            <View style={styles.categories}>
              {HOBBY_TYPES.map((h) => {
                const selected = hobbyType === h.id;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={[styles.catChip, selected && styles.hobbySelected]}
                    onPress={() => setHobbyType(h.id)}
                  >
                    <Text style={[styles.catText, selected && styles.hobbyTextSelected]}>
                      {h.icon} {h.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>
          {source === 'hobby'
            ? hobbyType === 'poetry'
              ? 'Poem title *'
              : hobbyType === 'singing' || hobbyType === 'music'
                ? 'Title / song name *'
                : hobbyType === 'reading'
                  ? 'Book / title *'
                  : 'Title *'
            : source === 'email'
              ? 'Title / Subject *'
              : 'Title *'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={
            source === 'hobby' && hobbyType === 'poetry'
              ? 'e.g. Rain over Rainham'
              : source === 'hobby' && hobbyType === 'singing'
                ? 'e.g. Practice – soft ballad'
                : 'What happened?'
          }
          placeholderTextColor="#64748b"
          value={title}
          onChangeText={setTitle}
          autoFocus={!isEditing}
        />

        {source === 'email' && (
          <>
            <Text style={styles.label}>From (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="sender@example.com"
              placeholderTextColor="#64748b"
              value={emailFrom}
              onChangeText={setEmailFrom}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </>
        )}

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          placeholder="2026-08-23"
          placeholderTextColor="#64748b"
          value={date}
          onChangeText={setDate}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((cat) => {
            const selected = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.catChip,
                  selected && { backgroundColor: cat.color + '33', borderColor: cat.color },
                ]}
                onPress={() => setCategory(cat.id)}
              >
                <Text
                  style={[
                    styles.catText,
                    selected && { color: cat.color, fontWeight: '600' },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {source === 'hobby' && hobbyType === 'poetry' && (
          <>
            <Text style={styles.label}>Album / book name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rainham Nights, Early Poems 2024"
              placeholderTextColor="#64748b"
              value={collectionName}
              onChangeText={setCollectionName}
            />

            <Text style={styles.label}>Cover photo</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. cover_rainham_nights.jpg  or  path to cover image"
              placeholderTextColor="#64748b"
              value={coverPhotoNote}
              onChangeText={setCoverPhotoNote}
            />
            <Text style={styles.fieldHint}>
              Filename or path for the book/album cover. Image picker can be added next.
            </Text>

            <Text style={styles.label}>Photo for this poem</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. poem_photo_01.jpg  or  gallery path"
              placeholderTextColor="#64748b"
              value={photoNote}
              onChangeText={setPhotoNote}
            />
            <Text style={styles.fieldHint}>
              Optional photo linked to this poem (illustration, moment, etc.).
            </Text>
          </>
        )}

        {source === 'hobby' && hobbyType !== 'poetry' && (
          <>
            <Text style={styles.label}>Photo (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. practice_photo.jpg  or  path to image"
              placeholderTextColor="#64748b"
              value={photoNote}
              onChangeText={setPhotoNote}
            />
          </>
        )}

        {source === 'hobby' && (hobbyType === 'singing' || hobbyType === 'music') && (
          <>
            <Text style={styles.label}>
              {hobbyType === 'singing' ? 'Singing file / recording note' : 'Audio / music file note'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. recording_2026-08-23.m4a  or  phone/Music/practice.mp3"
              placeholderTextColor="#64748b"
              value={audioNote}
              onChangeText={setAudioNote}
            />
            <Text style={styles.fieldHint}>
              Note the filename or path for now. Full file attach can be added next.
            </Text>
          </>
        )}

        {source === 'hobby' && hobbyType === 'reading' && (
          <>
            <Text style={styles.label}>Progress (chapter / page)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Chapter 4, page 87"
              placeholderTextColor="#64748b"
              value={readingProgress}
              onChangeText={setReadingProgress}
            />
          </>
        )}

        <Text style={styles.label}>Next action</Text>
        <View style={styles.categories}>
          {NEXT_ACTIONS.map((action) => {
            const selected = nextAction === action.id;
            return (
              <TouchableOpacity
                key={action.id}
                style={[styles.catChip, selected && styles.actionSelected]}
                onPress={() => setNextAction(action.id)}
              >
                <Text style={[styles.catText, selected && styles.actionTextSelected]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>
          {source === 'hobby' && hobbyType === 'poetry'
            ? 'Poem text'
            : source === 'email'
              ? 'Email notes / snippet'
              : 'Description'}
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            source === 'hobby' && hobbyType === 'poetry' && styles.poemArea,
          ]}
          placeholder={descriptionPlaceholder()}
          placeholderTextColor="#64748b"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={source === 'hobby' && hobbyType === 'poetry' ? 8 : 4}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveText}>
            {saving
              ? 'Saving…'
              : isEditing
                ? 'Update'
                : source === 'hobby'
                  ? 'Add hobby'
                  : 'Add Event'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  intro: {
    color: '#a5b4fc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  label: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 18,
    letterSpacing: 0.3,
  },
  fieldHint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b0764',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  poemArea: {
    minHeight: 180,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sourceChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sourceSelected: {
    backgroundColor: '#3b0764',
    borderColor: '#8b5cf6',
  },
  sourceText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  sourceTextSelected: {
    color: '#c4b5fd',
    fontWeight: '600',
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  catText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  hobbySelected: {
    backgroundColor: '#3b0764',
    borderColor: '#8b5cf6',
  },
  hobbyTextSelected: {
    color: '#c4b5fd',
    fontWeight: '600',
  },
  actionSelected: {
    backgroundColor: '#312e81',
    borderColor: '#3b82f6',
  },
  actionTextSelected: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
