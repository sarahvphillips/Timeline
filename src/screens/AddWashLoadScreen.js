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
import {
  saveEvent,
  deleteEvent,
  WASH_STATUSES,
  WASH_TUMBLE,
  buildWashTitle,
} from '../services/eventService';
import WashMediaField from '../components/WashMediaField';
import { auth } from '../services/firebase';

function ChipRow({ options, value, onChange }) {
  return (
    <View style={styles.row}>
      {options.map((s) => {
        const on = value === s.id;
        return (
          <TouchableOpacity
            key={s.id}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onChange(s.id)}
          >
            <Text style={[styles.chipText, on && styles.chipOnText]}>{s.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AddWashLoadScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const isEditing = !!existing;
  const paramDate = route.params?.date ? String(route.params.date).slice(0, 10) : null;

  const [washItems, setWashItems] = useState(existing?.washItems || '');
  const [washNote, setWashNote] = useState(existing?.washNote || '');
  const [washSetting, setWashSetting] = useState(existing?.washSetting || '');
  const [date, setDate] = useState(
    existing?.date ? existing.date.slice(0, 10) : paramDate || new Date().toISOString().slice(0, 10)
  );
  const [washStatus, setWashStatus] = useState(existing?.washStatus || 'loaded');
  const [washTumble, setWashTumble] = useState(existing?.washTumble || 'later');
  const [washSang, setWashSang] = useState(!!existing?.washSang);
  const [washSangAt, setWashSangAt] = useState(existing?.washSangAt || '');
  const [washSongNote, setWashSongNote] = useState(existing?.washSongNote || '');
  const [washCodes, setWashCodes] = useState(
    Array.isArray(existing?.washCodes) && existing.washCodes.length
      ? existing.washCodes.map((c) => ({
          code: c.code || '',
          time: c.time || '',
          note: c.note || '',
        }))
      : []
  );
  const [imageUri, setImageUri] = useState(existing?.imageUri || '');
  const [videoUri, setVideoUri] = useState(existing?.videoUri || '');
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
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      notify('Invalid date', 'Please use the format YYYY-MM-DD.');
      return;
    }
    const codes = washCodes
      .map((c) => ({
        code: String(c.code || '').trim(),
        time: String(c.time || '').trim(),
        note: String(c.note || '').trim() || undefined,
      }))
      .filter((c) => c.code || c.time);
    setSaving(true);
    try {
      const items = washItems.trim();
      const note = washNote.trim();
      const setting = washSetting.trim();
      const title = buildWashTitle(washStatus, items, setting);
      const description = [items, note].filter(Boolean).join('\n');
      await saveEvent({
        id: existing?.id,
        title,
        description,
        date: parsed.toISOString(),
        category: 'household',
        source: 'laundry',
        washStatus,
        washItems: items || undefined,
        washNote: note || undefined,
        washSetting: setting || undefined,
        washTumble,
        washSang: !!washSang,
        washSangAt: washSang ? washSangAt.trim() || undefined : undefined,
        washSongNote: washSang ? washSongNote.trim() || undefined : undefined,
        washCodes: codes.length ? codes : undefined,
        imageUri: imageUri || undefined,
        videoUri: videoUri || undefined,
        nextAction: 'none',
      });
      const notice = isEditing ? 'Updated.' : 'Saved.';
      setSaveNotice(notice);
      notify(isEditing ? 'Updated' : 'Saved', notice);
      navigation.goBack();
    } catch (e) {
      console.warn('AddWashLoad save failed', e);
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
      'Delete wash load',
      'Delete this wash load? Photo and video stay only on this device and will be removed here'
        + (auth.currentUser ? '. The Household event is also removed from the cloud (without media).' : '.'),
      'Delete',
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteEvent(existing.id);
      notify('Deleted', 'Wash load removed.');
      navigation.goBack();
    } catch (e) {
      notify('Could not delete', e?.message || 'Please try again.');
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
        <Text style={styles.heading}>{isEditing ? 'Edit wash load' : 'Wash load'}</Text>
        <Text style={styles.intro}>
          Household event on your timeline. Photos and videos stay on this phone or laptop.
        </Text>

        <WashMediaField
          imageUri={imageUri}
          videoUri={videoUri}
          onImage={setImageUri}
          onVideo={setVideoUri}
        />

        <Text style={styles.label}>Items</Text>
        <TextInput
          style={[styles.input, styles.tall]}
          placeholder="e.g. towels, darks, bedding"
          placeholderTextColor="#64748b"
          value={washItems}
          onChangeText={setWashItems}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Note</Text>
        <TextInput
          style={[styles.input, styles.tall]}
          placeholder="Optional note"
          placeholderTextColor="#64748b"
          value={washNote}
          onChangeText={setWashNote}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Machine setting</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Cotton 40"
          placeholderTextColor="#64748b"
          value={washSetting}
          onChangeText={setWashSetting}
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
        <ChipRow options={WASH_STATUSES} value={washStatus} onChange={setWashStatus} />

        <Text style={styles.label}>Tumble dry</Text>
        <ChipRow options={WASH_TUMBLE} value={washTumble} onChange={setWashTumble} />

        <Text style={styles.label}>Did the machine sing?</Text>
        <ChipRow
          options={[
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ]}
          value={washSang ? 'yes' : 'no'}
          onChange={(id) => setWashSang(id === 'yes')}
        />
        {washSang ? (
          <>
            <Text style={styles.label}>When (HH:MM)</Text>
            <TextInput
              style={styles.input}
              placeholder="14:32"
              placeholderTextColor="#64748b"
              value={washSangAt}
              onChangeText={setWashSangAt}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Song note</Text>
            <TextInput
              style={styles.input}
              placeholder="What it sounded like"
              placeholderTextColor="#64748b"
              value={washSongNote}
              onChangeText={setWashSongNote}
            />
          </>
        ) : null}

        <Text style={styles.label}>Time-based codes</Text>
        <Text style={styles.intro}>Code + time, optional note. Add as many as you need.</Text>
        {washCodes.map((row, idx) => (
          <View key={idx} style={styles.codeCard}>
            <TextInput
              style={styles.input}
              placeholder="Code"
              placeholderTextColor="#64748b"
              value={row.code}
              onChangeText={(t) => {
                const next = [...washCodes];
                next[idx] = { ...next[idx], code: t };
                setWashCodes(next);
              }}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Time (HH:MM)"
              placeholderTextColor="#64748b"
              value={row.time}
              onChangeText={(t) => {
                const next = [...washCodes];
                next[idx] = { ...next[idx], time: t };
                setWashCodes(next);
              }}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Note (optional)"
              placeholderTextColor="#64748b"
              value={row.note}
              onChangeText={(t) => {
                const next = [...washCodes];
                next[idx] = { ...next[idx], note: t };
                setWashCodes(next);
              }}
            />
            <TouchableOpacity
              onPress={() => setWashCodes(washCodes.filter((_, i) => i !== idx))}
              style={styles.removeCode}
            >
              <Text style={styles.removeCodeText}>Remove code</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          style={styles.addCode}
          onPress={() => setWashCodes([...washCodes, { code: '', time: '', note: '' }])}
        >
          <Text style={styles.addCodeText}>Add code</Text>
        </TouchableOpacity>

        {!!saveNotice && <Text style={styles.notice}>{saveNotice}</Text>}

        <TouchableOpacity
          style={[styles.save, (saving || deleting) && styles.saveDisabled]}
          onPress={handleSave}
          disabled={saving || deleting}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving…' : isEditing ? 'Update wash load' : 'Save wash load'}
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
  content: { padding: 20, paddingBottom: 48 },
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
  tall: { minHeight: 80 },
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
  chipOn: { borderColor: '#38bdf8', backgroundColor: '#0c4a6e' },
  chipOnText: { color: '#7dd3fc' },
  codeCard: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#12132a',
  },
  removeCode: { marginTop: 8 },
  removeCodeText: { color: '#fca5a5', fontWeight: '600' },
  addCode: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addCodeText: { color: '#94a3b8', fontWeight: '600' },
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
