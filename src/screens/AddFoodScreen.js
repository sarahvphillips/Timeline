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
import { saveEvent, deleteEvent } from '../services/eventService';
import ImageAttachField from '../components/ImageAttachField';
import { auth } from '../services/firebase';

const FOOD_STATUSES = [
  { id: 'planned', label: 'Planned' },
  { id: 'eaten', label: 'Eaten' },
];

function buildFoodTitle(foodStatus, foodItems) {
  const items = String(foodItems || '').trim().replace(/\s+/g, ' ');
  const statusLabel = foodStatus === 'planned' ? 'Planned' : 'Eaten';
  if (!items) return `Food (${statusLabel.toLowerCase()})`;
  const short = items.length > 48 ? items.slice(0, 45).trim() + '…' : items;
  return `${statusLabel}: ${short}`;
}

export default function AddFoodScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const isEditing = !!existing;
  const paramDate = route.params?.date
    ? String(route.params.date).slice(0, 10)
    : null;

  const [foodItems, setFoodItems] = useState(existing?.foodItems || existing?.description || '');
  const [date, setDate] = useState(
    existing?.date
      ? existing.date.slice(0, 10)
      : paramDate || new Date().toISOString().slice(0, 10)
  );
  const [foodStatus, setFoodStatus] = useState(
    existing?.foodStatus === 'planned' || existing?.foodStatus === 'eaten'
      ? existing.foodStatus
      : 'eaten'
  );
  const [imageUri, setImageUri] = useState(existing?.imageUri || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

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

  const handleSave = async () => {
    if (saving || deleting) return;
    setSaveNotice('');
    const items = foodItems.trim();
    if (!items && !imageUri) {
      notify('Add something', 'Enter food items or add a photo.');
      return;
    }
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      notify('Invalid date', 'Please use the format YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const title = buildFoodTitle(foodStatus, items);
      await saveEvent({
        id: existing?.id,
        title,
        description: items || '',
        date: parsed.toISOString(),
        category: 'other',
        source: 'food',
        foodStatus,
        foodItems: items || undefined,
        imageUri: imageUri || undefined,
        nextAction: 'none',
        shareId: existing?.shareId,
        isShared: existing?.isShared,
        sharedFrom: existing?.sharedFrom,
        sharedFromEmail: existing?.sharedFromEmail,
      });
      const notice = isEditing ? 'Updated.' : 'Saved.';
      setSaveNotice(notice);
      notify(isEditing ? 'Updated' : 'Saved', notice);
      navigation.goBack();
    } catch (e) {
      console.warn('AddFood save failed', e);
      const fail = e?.message || String(e) || 'Could not save. Please try again.';
      setSaveNotice(fail);
      notify('Error', fail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing?.id || saving || deleting) return;
    const ok = await confirmAction(
      'Delete food',
      'Delete this food entry? This removes it from this device'
        + (auth.currentUser ? ' and from your cloud copy.' : '.'),
      'Delete',
    );
    if (!ok) return;
    setDeleting(true);
    setSaveNotice('');
    try {
      await deleteEvent(existing.id);
      setSaveNotice('Deleted.');
      notify('Deleted', 'Food entry removed.');
      navigation.goBack();
    } catch (e) {
      const fail = e?.message || 'Could not delete. Please try again.';
      setSaveNotice(fail);
      notify('Could not delete', fail);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{isEditing ? 'Edit food' : 'Add food'}</Text>
        <Text style={styles.intro}>
          Photo-heavy meal note on your Timeline — not a calorie tracker.
        </Text>

        <ImageAttachField
          label="Photo"
          uri={imageUri}
          onChange={(picked) => setImageUri(picked && picked.uri ? picked.uri : '')}
          hint="Camera, gallery (Google Photos on Android), or a file."
        />

        <Text style={styles.label}>Items</Text>
        <TextInput
          style={[styles.input, styles.items]}
          placeholder="e.g. pasta, salad, coffee"
          placeholderTextColor="#64748b"
          value={foodItems}
          onChangeText={setFoodItems}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Status</Text>
        <View style={styles.row}>
          {FOOD_STATUSES.map((s) => {
            const on = foodStatus === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setFoodStatus(s.id)}
              >
                <Text style={[styles.chipText, on && styles.chipOnText]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!!saveNotice && <Text style={styles.notice}>{saveNotice}</Text>}

        <TouchableOpacity
          style={[styles.save, (saving || deleting) && styles.saveDisabled]}
          onPress={handleSave}
          disabled={saving || deleting}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving…' : isEditing ? 'Update food' : 'Save food'}
          </Text>
        </TouchableOpacity>

        {isEditing ? (
          <TouchableOpacity
            style={[styles.deleteBtn, (saving || deleting) && styles.saveDisabled]}
            onPress={handleDelete}
            disabled={saving || deleting}
          >
            <Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 40 },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  intro: { color: '#64748b', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 14, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  items: { minHeight: 100 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  chipOn: { borderColor: '#22c55e', backgroundColor: '#14532d' },
  chipOnText: { color: '#86efac' },
  notice: { color: '#94a3b8', marginTop: 16, fontSize: 14 },
  save: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  deleteBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
  },
  deleteText: { color: '#fca5a5', fontSize: 16, fontWeight: '600' },
});
