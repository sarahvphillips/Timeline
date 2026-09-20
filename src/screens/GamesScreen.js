import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import LabelPicker from '../components/LabelPicker';
import { saveEvent, deleteEvent } from '../services/eventService';
import {
  loadGames,
  saveGames,
  parseGameLink,
  steamHeader,
  playtimeLabel,
  PLATFORMS,
  STATUSES,
} from '../services/gamesService';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatUk(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${Number(d)}/${Number(m)}/${y}`;
}

export default function GamesScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [items, setItems] = useState([]);
  const [url, setUrl] = useState(existing?.gameUrl || '');
  const [title, setTitle] = useState(existing?.gameTitle || existing?.title || '');
  const [platform, setPlatform] = useState(existing?.gamePlatform || 'Steam');
  const [date, setDate] = useState(
    existing?.date ? String(existing.date).slice(0, 10) : todayIso()
  );
  const [hours, setHours] = useState(existing?.gameHours || '');
  const [minutes, setMinutes] = useState(existing?.gameMinutes || '');
  const [status, setStatus] = useState(existing?.gameStatus || 'Playing');
  const [note, setNote] = useState(existing?.gameNote || existing?.description || '');
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels) ? existing.labels.filter((l) => l !== 'Games') : []
  );
  const [addToTimeline, setAddToTimeline] = useState(true);
  const [editingId, setEditingId] = useState(existing?.id || null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parseGameLink(url), [url]);

  const reload = useCallback(async () => {
    setItems(await loadGames());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function reset() {
    setUrl('');
    setTitle('');
    setPlatform('Steam');
    setDate(todayIso());
    setHours('');
    setMinutes('');
    setStatus('Playing');
    setNote('');
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
    const time = playtimeLabel(row.hours, row.minutes);
    await saveEvent({
      id: row.id,
      title: `${row.title} · ${row.platform}`,
      description: [row.status, time, row.note, row.url].filter(Boolean).join(' · '),
      date: `${row.date}T12:00:00.000Z`,
      category: 'hobby',
      source: 'game',
      labels: Array.from(new Set(['Games', ...(row.labels || [])])),
      gameUrl: row.url,
      gameTitle: row.title,
      gamePlatform: row.platform,
      gameHours: row.hours,
      gameMinutes: row.minutes,
      gameStatus: row.status,
      gameNote: row.note,
      imageUri: steamHeader(row.steamAppId) || undefined,
    });
  }

  async function handleSave() {
    if (saving) return;
    const name = title.trim() || parsed.titleGuess;
    if (!name) {
      Alert.alert(
        'Need a title',
        'Type the game name, or paste a Steam / PlayStation / Play Store link.'
      );
      return;
    }
    const plat = parsed.platform || platform;
    const row = {
      id: editingId || `game-${Date.now()}`,
      title: name,
      platform: plat,
      url: url.trim(),
      steamAppId: parsed.steamAppId,
      date,
      hours,
      minutes,
      status,
      note: note.trim(),
      labels,
      addToTimeline,
    };
    setSaving(true);
    try {
      const next = [row, ...items.filter((g) => g.id !== row.id)];
      setItems(next);
      await saveGames(next);
      await persistTimeline(row);
      reset();
    } catch {
      Alert.alert('Error', 'Could not save the game.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setUrl(row.url || '');
    setTitle(row.title);
    setPlatform(row.platform || 'Steam');
    setDate(row.date);
    setHours(row.hours || '');
    setMinutes(row.minutes || '');
    setStatus(row.status || 'Playing');
    setNote(row.note || '');
    setLabels(row.labels || []);
    setAddToTimeline(row.addToTimeline !== false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Home</Text>
        <Text style={styles.heading}>Games</Text>
        <Text style={styles.intro}>
          Log a session. Paste a Steam, PlayStation or Play Store link if you have one. Live Steam /
          PSN / Android playtime is not connected — Sony has no official API, Android needs a native
          build, Steam needs a secret key that should not live in the phone app.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Store or share link (optional)</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              const hit = parseGameLink(t);
              if (hit.platform) setPlatform(hit.platform);
              if (hit.titleGuess && !title) setTitle(hit.titleGuess);
            }}
            placeholder="store.steampowered.com/app/…"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
          {parsed.steamAppId ? (
            <Image source={{ uri: steamHeader(parsed.steamAppId) }} style={styles.art} />
          ) : null}

          <Text style={styles.label}>Game title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="What you played"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Platform</Text>
          <View style={styles.row}>
            {PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, platform === p && styles.chipOn]}
                onPress={() => setPlatform(p)}
              >
                <Text style={[styles.chipText, platform === p && styles.chipTextOn]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Date · session</Text>
          <View style={styles.two}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={hours}
              onChangeText={setHours}
              placeholder="Hours"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={minutes}
              onChangeText={setMinutes}
              placeholder="Mins"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
            />
          </View>
          <Text style={styles.hint}>Shown as {date ? formatUk(date) : '—'}</Text>

          <Text style={styles.label}>Status</Text>
          <View style={styles.row}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, status === s && styles.chipOn]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={note}
            onChangeText={setNote}
            placeholder="How it went (optional)"
            placeholderTextColor="#64748b"
            multiline
          />

          <LabelPicker value={labels} onChange={setLabels} />

          <TouchableOpacity style={styles.shareRow} onPress={() => setAddToTimeline((v) => !v)}>
            <View style={[styles.box, addToTimeline && styles.boxOn]} />
            <Text style={styles.shareLabel}>Add to timeline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save game'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Played</Text>
        {items.length === 0 ? (
          <Text style={styles.hint}>Nothing yet.</Text>
        ) : (
          items.map((g) => (
            <View key={g.id} style={styles.log}>
              {g.steamAppId ? (
                <Image source={{ uri: steamHeader(g.steamAppId) }} style={styles.art} />
              ) : null}
              <Text style={styles.meta}>
                {g.platform} · {g.status}
              </Text>
              <Text style={styles.logTitle}>{g.title}</Text>
              <Text style={styles.hint}>
                {formatUk(g.date)}
                {playtimeLabel(g.hours, g.minutes) ? ` · ${playtimeLabel(g.hours, g.minutes)}` : ''}
              </Text>
              {g.note ? <Text style={styles.note}>{g.note}</Text> : null}
              <View style={styles.row}>
                <TouchableOpacity onPress={() => startEdit(g)}>
                  <Text style={styles.link}>Edit</Text>
                </TouchableOpacity>
                {g.url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(g.url)}>
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
  kicker: { color: '#a5b4fc', fontSize: 12, fontWeight: '700' },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, marginTop: 8, marginBottom: 16, lineHeight: 20 },
  card: { backgroundColor: '#1a1b36', borderRadius: 16, padding: 16 },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
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
  two: { flexDirection: 'row', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: '#64748b' },
  boxOn: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  shareLabel: { color: '#e2e8f0', fontSize: 14 },
  button: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  listTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  log: { backgroundColor: '#1a1b36', borderRadius: 16, padding: 16, marginBottom: 12 },
  logTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  meta: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  note: { color: '#cbd5e1', marginTop: 6 },
  link: { color: '#a5b4fc', fontWeight: '700', marginTop: 8, marginRight: 16 },
  art: { width: '100%', height: 120, borderRadius: 10, marginBottom: 8, backgroundColor: '#0f1024' },
});
