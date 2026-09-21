import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import LabelPicker from '../components/LabelPicker';
import { saveEvent, deleteEvent } from '../services/eventService';
import {
  WATCH_KINDS,
  WATCH_PLACES,
  WATCH_STATUSES,
  loadWatched,
  saveWatched,
  parseWatchLink,
  scoreLabel,
} from '../services/watchedService';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatUk(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${Number(d)}/${Number(m)}/${y}`;
}

export default function AddWatchedScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('All');
  const [kind, setKind] = useState(existing?.watchKind || 'Film');
  const [title, setTitle] = useState(existing?.watchTitle || existing?.title || '');
  const [series, setSeries] = useState(existing?.watchSeries || '');
  const [url, setUrl] = useState(existing?.watchUrl || '');
  const [date, setDate] = useState(
    existing?.date ? String(existing.date).slice(0, 10) : todayIso()
  );
  const [score, setScore] = useState(
    existing?.watchScore == null || existing?.watchScore === '' ? null : Number(existing.watchScore)
  );
  const [status, setStatus] = useState(existing?.watchStatus || 'Watched');
  const [description, setDescription] = useState(
    existing?.watchNote || existing?.description || ''
  );
  const [place, setPlace] = useState(existing?.watchPlace || 'Home');
  const [who, setWho] = useState(existing?.watchWith || '');
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels)
      ? existing.labels.filter((l) => l !== 'Watched' && l !== 'TV & films')
      : []
  );
  const [addToTimeline, setAddToTimeline] = useState(true);
  const [editingId, setEditingId] = useState(existing?.id || null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setItems(await loadWatched());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function reset() {
    setKind('Film');
    setTitle('');
    setSeries('');
    setUrl('');
    setDate(todayIso());
    setScore(null);
    setStatus('Watched');
    setDescription('');
    setPlace('Home');
    setWho('');
    setLabels([]);
    setAddToTimeline(true);
    setEditingId(null);
  }

  async function persistTimeline(row) {
    if (!row.addToTimeline) {
      try {
        await deleteEvent(row.id);
      } catch {
        /* may not exist */
      }
      return;
    }
    const bits = [row.kind, row.status, scoreLabel(row.score), row.place];
    if (row.series) bits.push(row.series);
    if (row.who) bits.push(`with ${row.who}`);
    await saveEvent({
      id: row.id,
      title: row.title,
      description: [row.note, bits.join(' · '), row.url].filter(Boolean).join('\n'),
      date: `${row.date}T12:00:00.000Z`,
      category: 'hobby',
      source: 'watched',
      hobbyType: 'watching',
      labels: Array.from(new Set(['Watched', ...(row.labels || [])])),
      watchKind: row.kind,
      watchTitle: row.title,
      watchSeries: row.series || undefined,
      watchUrl: row.url || undefined,
      watchScore: row.score,
      watchStatus: row.status,
      watchPlace: row.place,
      watchWith: row.who || undefined,
      watchNote: row.note || undefined,
    });
  }

  async function handleSave() {
    if (saving) return;
    const parsed = parseWatchLink(url);
    const name = title.trim() || parsed.titleGuess;
    if (!name) {
      Alert.alert('Need a title', 'What did you watch?');
      return;
    }
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    const row = {
      id: editingId || `watch-${Date.now()}`,
      kind,
      title: name,
      series: series.trim(),
      url: parsed.url || url.trim(),
      date: String(date).slice(0, 10),
      score,
      status,
      note: description.trim(),
      place,
      who: who.trim(),
      labels,
      addToTimeline,
    };
    setSaving(true);
    try {
      const next = [row, ...items.filter((w) => w.id !== row.id)];
      setItems(next);
      await saveWatched(next);
      await persistTimeline(row);
      reset();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setKind(row.kind || 'Film');
    setTitle(row.title || '');
    setSeries(row.series || '');
    setUrl(row.url || '');
    setDate(row.date || todayIso());
    setScore(row.score == null ? null : Number(row.score));
    setStatus(row.status || 'Watched');
    setDescription(row.note || '');
    setPlace(row.place || 'Home');
    setWho(row.who || '');
    setLabels(row.labels || []);
    setAddToTimeline(row.addToTimeline !== false);
  }

  const visible =
    filter === 'All' ? items : items.filter((w) => w.kind === filter);

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Home</Text>
        <Text style={styles.heading}>TV & films</Text>
        <Text style={styles.intro}>
          Log a film, series, or episode. Optional IMDb / Letterboxd link and a score out of 10.
          Not the same as YouTube (your uploads).
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.row}>
            {WATCH_KINDS.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, kind === k && styles.chipOn]}
                onPress={() => setKind(k)}
              >
                <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{k}</Text>
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

          <Text style={styles.label}>IMDb / Letterboxd (optional)</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              const hit = parseWatchLink(t);
              if (hit.titleGuess && !title) setTitle(hit.titleGuess);
            }}
            placeholder="imdb.com/title/… or letterboxd.com/film/…"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Watched on (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
          />
          <Text style={styles.hint}>Shown as {date ? formatUk(date) : '—'}</Text>

          <Text style={styles.label}>Status</Text>
          <View style={styles.row}>
            {WATCH_STATUSES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, status === s && styles.chipOn]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Score /10</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.chip, score == null && styles.chipOn]}
              onPress={() => setScore(null)}
            >
              <Text style={[styles.chipText, score == null && styles.chipTextOn]}>Unrated</Text>
            </TouchableOpacity>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.chip, score === n && styles.chipOn]}
                onPress={() => setScore(n)}
              >
                <Text style={[styles.chipText, score === n && styles.chipTextOn]}>{String(n)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Note</Text>
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
            {WATCH_PLACES.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, place === p && styles.chipOn]}
                onPress={() => setPlace(p)}
              >
                <Text style={[styles.chipText, place === p && styles.chipTextOn]}>{p}</Text>
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

          <LabelPicker value={labels} onChange={setLabels} />

          <TouchableOpacity style={styles.shareRow} onPress={() => setAddToTimeline((v) => !v)}>
            <View style={[styles.box, addToTimeline && styles.boxOn]} />
            <Text style={styles.shareLabel}>Add to timeline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save watched'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Logged</Text>
        <View style={styles.row}>
          {['All', ...WATCH_KINDS].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, filter === f && styles.chipOn]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {visible.length === 0 ? (
          <Text style={styles.hint}>Nothing yet.</Text>
        ) : (
          visible.map((w) => (
            <View key={w.id} style={styles.log}>
              <Text style={styles.meta}>
                {w.kind} · {w.status} · {scoreLabel(w.score)}
              </Text>
              <Text style={styles.logTitle}>{w.title}</Text>
              <Text style={styles.hint}>
                {formatUk(w.date)}
                {w.series ? ` · ${w.series}` : ''}
                {w.place ? ` · ${w.place}` : ''}
                {w.who ? ` · with ${w.who}` : ''}
              </Text>
              {w.note ? <Text style={styles.note}>{w.note}</Text> : null}
              <View style={styles.row}>
                <TouchableOpacity onPress={() => startEdit(w)}>
                  <Text style={styles.link}>Edit</Text>
                </TouchableOpacity>
                {w.url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(w.url)}>
                    <Text style={styles.link}>Open link</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <HomeFab navigation={navigation} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 120 },
  kicker: { color: '#f9a8d4', fontSize: 12, fontWeight: '700' },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, marginTop: 8, marginBottom: 16, lineHeight: 20 },
  card: { backgroundColor: '#1a1b36', borderRadius: 16, padding: 16 },
  label: { color: '#f9a8d4', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#0f1024',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#f8fafc',
  },
  area: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#db2777', borderColor: '#db2777' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: '#64748b' },
  boxOn: { backgroundColor: '#db2777', borderColor: '#db2777' },
  shareLabel: { color: '#e2e8f0', fontSize: 14 },
  button: {
    backgroundColor: '#db2777',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  listTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  log: { backgroundColor: '#1a1b36', borderRadius: 16, padding: 16, marginBottom: 12 },
  logTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  meta: { color: '#f9a8d4', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  note: { color: '#cbd5e1', marginTop: 6 },
  link: { color: '#f9a8d4', fontWeight: '700', marginTop: 8, marginRight: 16 },
});
