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
import { saveEvent } from '../services/eventService';

const KINDS = ['Film', 'TV series', 'Episode'];
const PLACES = ['Home', 'Cinema', 'Other'];

export default function AddWatchedScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [kind, setKind] = useState(existing?.watchKind || 'Film');
  const [title, setTitle] = useState(existing?.title || '');
  const [series, setSeries] = useState(existing?.watchSeries || '');
  const [date, setDate] = useState(
    existing?.date ? String(existing.date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [score, setScore] = useState(
    existing?.watchScore == null || existing?.watchScore === '' ? null : Number(existing.watchScore)
  );
  const [description, setDescription] = useState(existing?.description || '');
  const [place, setPlace] = useState(existing?.watchPlace || 'Home');
  const [who, setWho] = useState(existing?.watchWith || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const name = title.trim();
    if (!name) {
      Alert.alert('Need a title', 'What did you watch?');
      return;
    }
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    try {
      const bits = [kind, score == null ? 'unrated' : `${score}/10`, place];
      if (series.trim()) bits.push(series.trim());
      if (who.trim()) bits.push(`with ${who.trim()}`);
      await saveEvent({
        id: existing?.id,
        title: name,
        description: [description.trim(), bits.join(' · ')].filter(Boolean).join('\n\n'),
        date: parsed.toISOString(),
        category: 'other',
        source: 'hobby',
        nextAction: 'none',
        watchKind: kind,
        watchSeries: series.trim() || undefined,
        watchScore: score,
        watchPlace: place,
        watchWith: who.trim() || undefined,
      });
      Alert.alert(existing ? 'Updated' : 'Saved', 'Logged as a Hobby event.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>TV & films</Text>
        <Text style={styles.intro}>What you watched, a short note, and a score out of 10.</Text>

        <Text style={styles.label}>Type</Text>
        <View style={styles.row}>
          {KINDS.map((k) => (
            <TouchableOpacity key={k} style={[styles.chip, kind === k && styles.chipOn]} onPress={() => setKind(k)}>
              <Text style={[styles.chipText, kind === k && styles.chipOnText]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{kind === 'Episode' ? 'Episode title' : 'Title'}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={kind === 'Film' ? 'The film' : 'Show or episode'}
          placeholderTextColor="#64748b"
        />

        {kind !== 'Film' ? (
          <>
            <Text style={styles.label}>Series name</Text>
            <TextInput
              style={styles.input}
              value={series}
              onChangeText={setSeries}
              placeholder="Optional"
              placeholderTextColor="#64748b"
            />
          </>
        ) : null}

        <Text style={styles.label}>Watched on (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#64748b" />

        <Text style={styles.label}>Score /10</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.chip, score == null && styles.chipOn]} onPress={() => setScore(null)}>
            <Text style={[styles.chipText, score == null && styles.chipOnText]}>Unrated</Text>
          </TouchableOpacity>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <TouchableOpacity key={n} style={[styles.chip, score === n && styles.chipOn]} onPress={() => setScore(n)}>
              <Text style={[styles.chipText, score === n && styles.chipOnText]}>{String(n)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={description}
          onChangeText={setDescription}
          placeholder="What it was, how it felt."
          placeholderTextColor="#64748b"
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Where</Text>
        <View style={styles.row}>
          {PLACES.map((p) => (
            <TouchableOpacity key={p} style={[styles.chip, place === p && styles.chipOn]} onPress={() => setPlace(p)}>
              <Text style={[styles.chipText, place === p && styles.chipOnText]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>With</Text>
        <TextInput
          style={styles.input}
          value={who}
          onChangeText={setWho}
          placeholder="Optional"
          placeholderTextColor="#64748b"
        />

        <TouchableOpacity style={[styles.save, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Save watched'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 48 },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700' },
  intro: { color: '#64748b', fontSize: 13, lineHeight: 18, marginTop: 8 },
  label: { color: '#94a3b8', fontSize: 14, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  area: { minHeight: 90 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipOn: { borderColor: '#3b82f6', backgroundColor: '#1e3a8a' },
  chipText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  chipOnText: { color: '#bfdbfe' },
  save: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  disabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
