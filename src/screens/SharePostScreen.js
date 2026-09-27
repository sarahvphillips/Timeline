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
import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { saveEvent } from '../services/eventService';
import { copyTextToClipboard } from '../services/shareService';
import {
  defaultShareCaption,
  eventShareImage,
  shareTextAndImage,
  openXCompose,
  openEmailCompose,
  withShareFooter,
  SHARE_FOOTER,
} from '../services/socialShare';

const APP_ICON = require('../../assets/icon.png');

export default function SharePostScreen({ navigation, route }) {
  const event = route.params?.event;
  const photo = eventShareImage(event);
  const [caption, setCaption] = useState(defaultShareCaption(event));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const postText = () => withShareFooter(caption);

  const copyCaption = async () => {
    const text = postText();
    if (!String(caption || '').trim()) {
      Alert.alert('Nothing to copy', 'Write the sharing text first.');
      return false;
    }
    let ok = false;
    try {
      const mod = require('expo-clipboard');
      const Clipboard = mod?.default && (mod.default.setStringAsync || mod.default.setString) ? mod.default : mod;
      if (typeof Clipboard.setStringAsync === 'function') {
        await Clipboard.setStringAsync(text);
        ok = true;
      } else if (typeof Clipboard.setString === 'function') {
        Clipboard.setString(text);
        ok = true;
      }
    } catch (_) {}
    if (!ok) ok = await copyTextToClipboard(text);
    setCopied(!!ok);
    return ok;
  };

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
    const copiedOk = await copyCaption();
    try {
      const result = await shareTextAndImage({
        title: event.title || 'Timeline',
        message: postText(),
        imageUri: photo,
      });
      if (result === 'sheet') {
        Alert.alert(
          copiedOk ? 'Copied, then pick an app' : 'Pick an app',
          copiedOk
            ? 'The sharing text is on the clipboard. The picture is in the share sheet. Paste the text in X or Instagram if the caption box is empty.'
            : 'Choose X, Instagram, Facebook or Gmail. Use the copy icon if you need the text.',
        );
      }
    } catch (e) {
      Alert.alert('Could not share', e?.message || 'Try Email or X instead.');
    }
  };

  const handleX = async () => {
    await persistCaption();
    const copiedOk = await copyCaption();
    try {
      const sent = photo
        ? await shareTextAndImage({
            title: 'Share to X',
            message: postText(),
            imageUri: photo,
          })
        : await openXCompose(postText(), '');
      if (photo && sent === 'sheet') {
        Alert.alert(
          copiedOk ? 'Copied — pick X' : 'Pick X',
          copiedOk
            ? 'The sharing text is on the clipboard. Choose X, then paste if the post box is empty.'
            : 'Choose X in the list. Use the copy icon for the text.',
        );
      } else if (sent === 'x-text-only' || sent === 'x-web') {
        Alert.alert(
          copiedOk ? 'Copied to clipboard' : 'Opened X',
          'Paste the sharing text into the post if it is not already there.',
        );
      }
    } catch (e) {
      Alert.alert('Could not open X', e?.message || 'Use Share to apps and pick X.');
    }
  };

  const handleEmail = async () => {
    await persistCaption();
    const copiedOk = await copyCaption();
    try {
      const result = await openEmailCompose(event.title || 'Timeline', postText(), photo);
      if (result === 'sheet' || result === 'intent') {
        Alert.alert(
          copiedOk ? 'Copied — pick email' : 'Pick email',
          copiedOk
            ? 'The sharing text is on the clipboard. Choose Gmail, then paste if the message is empty.'
            : 'Choose Gmail or Email. Use the copy icon for the text.',
        );
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

      <View style={styles.labelRow}>
        <Text style={styles.label}>Sharing text</Text>
        <TouchableOpacity
          onPress={async () => {
            const ok = await copyCaption();
            Alert.alert(
              ok === 'share' ? 'Share sheet opened' : ok ? 'Copied to clipboard' : 'Could not copy',
              ok === 'share'
                ? 'Choose Copy or an app. The sharing text is in that sheet.'
                : ok
                  ? 'Paste this text into X, Instagram, Facebook or email.'
                  : 'Long-press the sharing text box and choose Copy.',
            );
          }}
          accessibilityLabel="Copy sharing text"
          style={styles.copyBtn}
        >
          <Ionicons name="copy-outline" size={20} color="#93c5fd" />
          <Text style={styles.copyLabel}>Copy</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Used as the post message. Copy puts it on the clipboard. Share apps often keep the picture only, so paste this text there.
      </Text>
      {copied ? <Text style={styles.copiedNote}>Sharing text copied to clipboard.</Text> : null}
      <TextInput
        style={styles.input}
        value={caption}
        onChangeText={setCaption}
        multiline
        textAlignVertical="top"
        placeholder="Write the post…"
        placeholderTextColor="#64748b"
      />

      <View style={styles.brandRow}>
        <Image source={APP_ICON} style={styles.brandIcon} />
        <Text style={styles.brandText}>{SHARE_FOOTER}</Text>
      </View>
      <Text style={styles.hint}>
        This line and the Timeline icon are added when you copy or share, unless the text already says Shared with Timeline or Posted with Timeline.
      </Text>

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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyLabel: { color: '#93c5fd', fontWeight: '700', fontSize: 14 },
  copiedNote: { color: '#86efac', fontSize: 13, marginBottom: 8 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  brandIcon: { width: 28, height: 28, borderRadius: 6 },
  brandText: { color: '#e2e8f0', fontWeight: '700', fontSize: 15 },
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
