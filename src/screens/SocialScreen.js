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
import { pickFromGallery } from '../services/imagePicker';
import {
  loadSocial,
  saveSocial,
  parseSocialLink,
  PLATFORMS,
  ACTIONS,
} from '../services/socialService';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatUk(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${Number(d)}/${Number(m)}/${y}`;
}

export default function SocialScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [items, setItems] = useState([]);
  const [url, setUrl] = useState(existing?.socialUrl || '');
  const [title, setTitle] = useState(existing?.socialTitle || existing?.title || '');
  const [platform, setPlatform] = useState(existing?.socialPlatform || 'X');
  const [action, setAction] = useState(existing?.socialAction || 'Posted');
  const [date, setDate] = useState(
    existing?.date ? String(existing.date).slice(0, 10) : todayIso()
  );
  const [note, setNote] = useState(existing?.socialNote || existing?.description || '');
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels)
      ? existing.labels.filter((l) => l !== 'Social' && l !== existing?.socialPlatform)
      : []
  );
  const [addToTimeline, setAddToTimeline] = useState(true);
  const [editingId, setEditingId] = useState(existing?.id || null);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(existing?.imageUri || '');

  const parsed = useMemo(() => parseSocialLink(url), [url]);

  const reload = useCallback(async () => {
    setItems(await loadSocial());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function reset() {
    setUrl('');
    setTitle('');
    setPlatform('X');
    setAction('Posted');
    setDate(todayIso());
    setNote('');
    setLabels([]);
    setAddToTimeline(true);
    setEditingId(null);
    setPhoto('');
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
    await saveEvent({
      id: row.id,
      title: `${row.platform} · ${row.title}`,
      description: [row.action, row.note, row.url].filter(Boolean).join(' · '),
      date: `${row.date}T12:00:00.000Z`,
      category: 'hobby',
      source: 'social',
      labels: Array.from(new Set(['Social', row.platform, ...(row.labels || [])])),
      socialUrl: row.url,
      socialTitle: row.title,
      socialPlatform: row.platform,
      socialAction: row.action,
      socialNote: row.note,
      imageUri: row.imageUri || undefined,
    });
  }

  async function handleSave() {
    if (saving) return;
    const name = title.trim() || parsed.titleGuess;
    if (!name && !url.trim()) {
      Alert.alert('Need a post', 'Paste a link or type a short title.');
      return;
    }
    const plat = parsed.platform || platform;
    const row = {
      id: editingId || `social-${Date.now()}`,
      platform: plat,
      url: url.trim(),
      title: name || `${plat} post`,
      action,
      date,
      note: note.trim(),
      labels,
      addToTimeline,
      imageUri: photo || undefined,
    };
    setSaving(true);
    try {
      const next = [row, ...items.filter((p) => p.id !== row.id)];
      setItems(next);
      await saveSocial(next);
      await persistTimeline(row);
      reset();
    } catch {
      Alert.alert('Error', 'Could not save the post.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setUrl(row.url || '');
    setTitle(row.title);
    setPlatform(row.platform || 'X');
    setAction(row.action || 'Posted');
    setDate(row.date);
    setNote(row.note || '');
    setLabels(row.labels || []);
    setAddToTimeline(row.addToTimeline !== false);
    setPhoto(row.imageUri || '');
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Timeline</Text>
        <Text style={styles.heading}>Social media</Text>
        <Text style={styles.intro}>
          Log a post you made, shared, or saved. Paste the link if you have one. No live Instagram /
          X / TikTok login — those don’t offer a simple “my posts” feed for this app.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Post link (optional)</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              const hit = parseSocialLink(t);
              if (hit.platform) setPlatform(hit.platform);
              if (hit.titleGuess && !title) setTitle(hit.titleGuess);
            }}
            placeholder="x.com/… or instagram.com/p/…"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />

          <Text style={styles.label}>What it is</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Short title or caption"
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

          <Text style={styles.label}>You</Text>
          <View style={styles.row}>
            {ACTIONS.map((a) => (
              <TouchableOpacity
                key={a}
                style={[styles.chip, action === a && styles.chipOn]}
                onPress={() => setAction(a)}
              >
                <Text style={[styles.chipText, action === a && styles.chipTextOn]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
          />
          <Text style={styles.hint}>{date ? formatUk(date) : ''}</Text>

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor="#64748b"
            multiline
          />

          <LabelPicker value={labels} onChange={setLabels} />

          <Text style={styles.label}>Screenshot or photo</Text>
          {photo ? <Image source={{ uri: photo }} style={styles.art} /> : null}
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.chip}
              onPress={async () => {
                const uri = await pickFromGallery();
                if (uri) setPhoto(uri);
              }}
            >
              <Text style={styles.chipText}>{photo ? 'Change photo' : 'Add photo'}</Text>
            </TouchableOpacity>
            {photo ? (
              <TouchableOpacity style={styles.chip} onPress={() => setPhoto('')}>
                <Text style={styles.chipText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.hint}>
            Instagram / Facebook / X don’t send the post image here. Add a screenshot if you want it
            on the timeline.
          </Text>

          <TouchableOpacity style={styles.shareRow} onPress={() => setAddToTimeline((v) => !v)}>
            <View style={[styles.box, addToTimeline && styles.boxOn]} />
            <Text style={styles.shareLabel}>Add to timeline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save post'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Logged</Text>
        {items.length === 0 ? (
          <Text style={styles.hint}>Nothing yet.</Text>
        ) : (
          items.map((p) => (
            <View key={p.id} style={styles.log}>
              <Text style={styles.meta}>
                {p.platform} · {p.action}
              </Text>
              <Text style={styles.logTitle}>{p.title}</Text>
              {p.imageUri ? <Image source={{ uri: p.imageUri }} style={styles.art} /> : null}
              <Text style={styles.hint}>{formatUk(p.date)}</Text>
              {p.note ? <Text style={styles.note}>{p.note}</Text> : null}
              <View style={styles.row}>
                <TouchableOpacity onPress={() => startEdit(p)}>
                  <Text style={styles.link}>Edit</Text>
                </TouchableOpacity>
                {p.url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(p.url)}>
                    <Text style={styles.link}>Open post</Text>
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
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#0f1024' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: '#64748b' },
  boxOn: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  shareLabel: { color: '#e2e8f0', fontSize: 14 },
  button: {
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#0f1024', fontWeight: '700' },
  listTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  log: { backgroundColor: '#1a1b36', borderRadius: 16, padding: 16, marginBottom: 12 },
  logTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  meta: { color: '#7dd3fc', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  note: { color: '#cbd5e1', marginTop: 6 },
  link: { color: '#7dd3fc', fontWeight: '700', marginTop: 8, marginRight: 16 },
  art: { width: '100%', height: 160, borderRadius: 10, marginTop: 8, backgroundColor: '#0f1024' },
});
