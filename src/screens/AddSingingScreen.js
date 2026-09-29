import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import LabelPicker from '../components/LabelPicker';
import CallAudioField from '../components/CallAudioField';
import { saveEvent, getEvents, deleteEvent } from '../services/eventService';
import { formatUk } from '../services/dateSpanService';
import { useTheme } from '../themeContext';

const KINDS = [
  { id: 'singing', label: 'Singing' },
  { id: 'music', label: 'Music / instrument' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isPoem(e) {
  return e?.source === 'poem' || e?.hobbyType === 'poetry';
}

function isTake(e) {
  return e?.source === 'hobby' && (e?.hobbyType === 'singing' || e?.hobbyType === 'music');
}

export default function AddSingingScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const existing = route.params?.event || null;
  const [kind, setKind] = useState(existing?.hobbyType === 'music' ? 'music' : 'singing');
  const [title, setTitle] = useState(existing?.title || '');
  const [date, setDate] = useState(existing?.date ? String(existing.date).slice(0, 10) : todayIso());
  const [felt, setFelt] = useState(existing?.singingFelt || existing?.description || '');
  const [lyrics, setLyrics] = useState(existing?.singingLyrics || '');
  const [poemId, setPoemId] = useState(existing?.poemEventId || '');
  const [audioUri, setAudioUri] = useState(existing?.audioUri || existing?.videoUri || '');
  const [audioName, setAudioName] = useState(existing?.audioName || '');
  const [audioKind, setAudioKind] = useState(existing?.audioKind || (existing?.videoUri ? 'video' : 'audio'));
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels) ? existing.labels.filter((l) => l !== 'Singing' && l !== 'Music') : [],
  );
  const [poems, setPoems] = useState([]);
  const [logged, setLogged] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const events = await getEvents();
    setPoems(
      (events || [])
        .filter(isPoem)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    );
    setLogged(
      (events || [])
        .filter(isTake)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const reset = () => {
    setKind('singing');
    setTitle('');
    setDate(todayIso());
    setFelt('');
    setLyrics('');
    setPoemId('');
    setAudioUri('');
    setAudioName('');
    setAudioKind('audio');
    setLabels([]);
  };

  const handleSave = async () => {
    const label = title.trim();
    if (!label) {
      Alert.alert('Need a title', 'Name of the song, piece, or take.');
      return;
    }
    const poem = poems.find((p) => p.id === poemId);
    setSaving(true);
    try {
      await saveEvent({
        id: existing?.id,
        title: label,
        description: felt.trim(),
        date: new Date(`${date}T12:00:00`).toISOString(),
        category: 'hobby',
        source: 'hobby',
        hobbyType: kind,
        labels: Array.from(new Set([kind === 'music' ? 'Music' : 'Singing', ...labels])),
        nextAction: 'none',
        audioUri: audioKind === 'video' ? undefined : audioUri || undefined,
        videoUri: audioKind === 'video' ? audioUri || undefined : undefined,
        audioName: audioName || undefined,
        audioKind: audioUri ? audioKind : undefined,
        singingFelt: felt.trim(),
        singingLyrics: lyrics.trim(),
        poemEventId: poem?.id || '',
        poemTitle: poem?.title || '',
      });
      await load();
      if (!existing) reset();
      Alert.alert('Saved', `${label} is on the timeline under Singing.`);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save this take.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Hobby</Text>
        <Text style={styles.heading}>{existing ? 'Edit take' : 'Singing / music'}</Text>
        <Text style={styles.intro}>
          A take of you singing or playing. The file stays on this phone. Optional lyrics and a link
          to a poem you already saved.
        </Text>

        <Text style={styles.label}>Kind</Text>
        <View style={styles.row}>
          {KINDS.map((k) => (
            <TouchableOpacity
              key={k.id}
              style={[styles.chip, kind === k.id && styles.chipOn]}
              onPress={() => setKind(k.id)}
            >
              <Text style={[styles.chipText, kind === k.id && styles.chipTextOn]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Song or piece name"
          placeholderTextColor="#64748b"
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
        <Text style={styles.hint}>{date ? formatUk(date) : '—'}</Text>

        <CallAudioField
          gated={false}
          audioUri={audioUri}
          audioName={audioName}
          audioKind={audioKind}
          label={kind === 'music' ? 'This take' : 'This singing take'}
          hint="Attach a file from Voice Recorder / Files, record in the app, or add a video of the take. Stays on this device — not uploaded to Firestore."
          showScreen
          screenLabel="Video of this take"
          recordLabel="Record take"
          onChange={(file) => {
            setAudioUri(file.uri || '');
            setAudioName(file.name || '');
            setAudioKind(file.kind || 'audio');
          }}
        />

        <Text style={styles.label}>How it felt</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={felt}
          onChangeText={setFelt}
          placeholder="Mood, room, what you noticed"
          placeholderTextColor="#64748b"
          multiline
        />

        <Text style={styles.label}>Lyrics or notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={lyrics}
          onChangeText={setLyrics}
          placeholder="Paste lyrics, chords, or a line you want to keep"
          placeholderTextColor="#64748b"
          multiline
        />

        <Text style={styles.label}>Link a poem (optional)</Text>
        <View style={styles.row}>
          {poems.length === 0 ? (
            <Text style={styles.hint}>No poems saved yet.</Text>
          ) : (
            poems.slice(0, 12).map((p) => {
              const on = poemId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setPoemId(on ? '' : p.id)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                    {p.title}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <LabelPicker value={labels} onChange={setLabels} />

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save to timeline'}</Text>
        </TouchableOpacity>

        <Text style={styles.listTitle}>Saved takes</Text>
        {logged.length === 0 ? (
          <Text style={styles.hint}>None yet.</Text>
        ) : (
          logged.map((item) => (
            <View key={item.id} style={styles.log}>
              <TouchableOpacity onPress={() => navigation.push('AddSinging', { event: item })}>
                <Text style={styles.logTitle}>{item.title}</Text>
                <Text style={styles.hint}>
                  {item.hobbyType === 'music' ? 'Music' : 'Singing'} · {formatUk(item.date)}
                  {item.audioUri || item.videoUri ? ' · file on device' : ''}
                  {item.poemTitle ? ` · poem: ${item.poemTitle}` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const run = () => deleteEvent(item.id).then(load);
                  if (Platform.OS === 'web' && window.confirm) {
                    if (window.confirm('Remove this take?')) run();
                    return;
                  }
                  Alert.alert('Remove', 'Remove this take from the timeline?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: run },
                  ]);
                }}
              >
                <Text style={styles.delete}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  content: { padding: 20, paddingBottom: 110 },
  kicker: {
    color: c.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heading: { color: c.text, fontSize: 26, fontWeight: '800', marginTop: 4 },
  intro: { color: c.faint, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  label: { color: '#ddd6fe', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  hint: { color: c.faint, fontSize: 13, marginBottom: 8 },
  input: {
    backgroundColor: '#0a0a12',
    borderColor: c.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: c.faint,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  chipOn: { backgroundColor: '#5b21b6', borderColor: c.muted },
  chipText: { color: c.faint, fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  button: {
    backgroundColor: c.spine,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  listTitle: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  log: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  logTitle: { color: c.text, fontWeight: '700', fontSize: 16 },
  delete: { color: c.danger, fontWeight: '700', fontSize: 13, marginTop: 6 },
});
}

