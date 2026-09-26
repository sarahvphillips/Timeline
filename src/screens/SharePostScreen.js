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
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { saveEvent } from '../services/eventService';
import {
  defaultShareCaption,
  eventShareImage,
  shareTextAndImage,
  openXCompose,
  openEmailCompose,
} from '../services/socialShare';

export default function SharePostScreen({ navigation, route }) {
  const event = route.params?.event;
  const photo = eventShareImage(event);
  const [caption, setCaption] = useState(defaultShareCaption(event));
  const [saving, setSaving] = useState(false);

  if (!event) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>This event could not be shared.</Text>
      </View>
    );
  }

  const persistCaption = async () => {
    setSaving(true);
    try {
      await saveEvent({ ...event, shareCaption: caption });
    } catch {
      Alert.alert('Could not save', 'The post text was not stored. You can still share it now.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await persistCaption();
    Alert.alert('Saved', 'This text will be used the next time you share this item.');
  };

  const handleSheet = async () => {
    await persistCaption();
    try {
      const result = await shareTextAndImage({
        title: event.title || 'Timeline',
        message: caption,
        imageUri: photo,
      });
      if (result === 'sheet') {
        Alert.alert(
          'Pick an app',
          photo
            ? 'The picture is in the share sheet. The caption was copied, so paste it in X or Instagram if the app did not keep the text.'
            : 'Choose X, Instagram, Facebook or Gmail.',
        );
      }
    } catch (e) {
      Alert.alert('Could not share', e?.message || 'Try Email or X instead.');
    }
  };

  const handleX = async () => {
    await persistCaption();
    try {
      const sent = photo
        ? await shareTextAndImage({
            title: 'Share to X',
            message: caption,
            imageUri: photo,
          })
        : await openXCompose(caption, '');
      if (photo && sent === 'sheet') {
        Alert.alert('Pick X', 'The image is attached and the caption is copied. Choose X in the list.');
      } else if (sent === 'x-text-only' || sent === 'x-web') {
        Alert.alert(
          'Text sent to X',
          'The caption is in the post box and also copied. Attach the image in X if it did not appear.',
        );
      }
    } catch (e) {
      Alert.alert('Could not open X', e?.message || 'Use Share to apps and pick X.');
    }
  };

  const handleEmail = async () => {
    await persistCaption();
    try {
      const result = await openEmailCompose(event.title || 'Timeline', caption, photo);
      if (result === 'sheet') {
        Alert.alert('Pick email', 'Choose Gmail or Email. The image is attached and the caption is copied.');
      }
    } catch (e) {
      Alert.alert('Could not open email', e?.message || 'Use Share to apps instead.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Share post</Text>
      <Text style={styles.intro}>
        This text is the caption for X, Instagram, Facebook or email. It is saved on the event. Timeline
        cannot log in to those apps for you — the share sheet or X compose window opens, then you post.
      </Text>

      {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" /> : (
        <Text style={styles.noPhoto}>No image on this event. The post will be text only.</Text>
      )}

      <Text style={styles.label}>Sharing text</Text>
      <Text style={styles.hint}>
        Used as the post message. Edit it here if you want a shorter X caption than the full poem.
      </Text>
      <TextInput
        style={styles.input}
        value={caption}
        onChangeText={setCaption}
        multiline
        textAlignVertical="top"
        placeholder="Write the post…"
        placeholderTextColor="#64748b"
      />

      <TouchableOpacity style={styles.save} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save sharing text'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primary} onPress={handleSheet}>
        <Text style={styles.primaryText}>Share to apps</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>Opens the phone share sheet — pick X, Instagram, Facebook or Gmail.</Text>

      <TouchableOpacity style={styles.ghost} onPress={handleX}>
        <View style={styles.xRow}>
          <FontAwesome6 name="x-twitter" size={18} color="#f8fafc" />
          <Text style={styles.ghostText}>Open in X</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.hint}>
        Uses the same share sheet as above so the image is included. Pick X, then paste the caption if it is not already in the box.
      </Text>

      <TouchableOpacity style={styles.ghost} onPress={handleEmail}>
        <Text style={styles.ghostText}>Email</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 22, paddingBottom: 48 },
  emptyWrap: { flex: 1, backgroundColor: '#0f1024', justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#94a3b8', fontSize: 16 },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  photo: {
    width: '100%',
    height: 280,
    borderRadius: 14,
    backgroundColor: '#0a0b18',
    marginBottom: 16,
  },
  noPhoto: { color: '#64748b', marginBottom: 16, fontSize: 14 },
  label: { color: '#94a3b8', fontSize: 14, marginBottom: 6 },
  hint: { color: '#64748b', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 16,
    minHeight: 160,
    marginBottom: 12,
  },
  save: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveText: { color: '#e2e8f0', fontWeight: '700', fontSize: 16 },
  primary: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghost: {
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  ghostText: { color: '#93c5fd', fontWeight: '700', fontSize: 16 },
  xRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});
