import React, { useCallback, useState } from 'react';
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
import { saveEvent, deleteEvent } from '../services/eventService';
import {
  loadYoutube,
  saveYoutube,
  parseYoutubeId,
  watchUrl,
  thumbUrl,
  SAMPLE_SHARE_FRIENDS,
} from '../services/youtubeService';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatUk(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${Number(d)}/${Number(m)}/${y}`;
}

export default function YouTubeScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [items, setItems] = useState([]);
  const [url, setUrl] = useState(existing?.youtubeUrl || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [date, setDate] = useState(
    existing?.date ? String(existing.date).slice(0, 10) : todayIso()
  );
  const [note, setNote] = useState(existing?.description || existing?.youtubeNote || '');
  const [addToTimeline, setAddToTimeline] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedWith, setSharedWith] = useState(existing?.youtubeSharedWith || []);
  const [editingId, setEditingId] = useState(existing?.id || null);
  const [openId, setOpenId] = useState(existing?.id || null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const list = await loadYoutube();
    setItems(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function resetForm() {
    setUrl('');
    setTitle('');
    setDate(todayIso());
    setNote('');
    setAddToTimeline(true);
    setShareOpen(false);
    setSharedWith([]);
    setEditingId(null);
  }

  function toggleFriend(id) {
    setSharedWith((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function persistList(next) {
    setItems(next);
    await saveYoutube(next);
  }

  async function persistTimeline(row) {
    const names = SAMPLE_SHARE_FRIENDS.filter((f) => row.sharedWith.includes(f.id))
      .map((f) => f.name)
      .join(', ');
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
      title: row.title,
      description: [row.note, row.url, names ? `Shared with ${names}` : ''].filter(Boolean).join('\n'),
      date: `${row.date}T12:00:00.000Z`,
      category: 'youtube',
      source: 'youtube',
      labels: ['YouTube'],
      youtubeUrl: row.url,
      youtubeVideoId: row.videoId,
      youtubeNote: row.note,
      youtubeSharedWith: row.sharedWith,
      imageUri: row.thumbnail,
    });
  }

  async function handleSave() {
    if (saving) return;
    const videoId = parseYoutubeId(url);
    if (!videoId) {
      Alert.alert('Need a YouTube link', 'Paste a youtu.be or youtube.com link.');
      return;
    }
    const name = title.trim() || 'YouTube upload';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert('Need a date', 'Use YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    const row = {
      id: editingId || `yt-${Date.now()}`,
      videoId,
      url: watchUrl(videoId),
      title: name,
      date: date.trim(),
      note: note.trim(),
      addToTimeline,
      sharedWith: shareOpen ? sharedWith : [],
      thumbnail: thumbUrl(videoId),
      createdAt: new Date().toISOString(),
    };
    try {
      const next = [row, ...items.filter((x) => x.id !== row.id)];
      await persistList(next);
      await persistTimeline(row);
      setOpenId(row.id);
      Alert.alert(
        'Saved',
        row.addToTimeline
          ? 'On your uploads list and on the timeline.'
          : 'Saved to your uploads list (not the timeline).'
      );
      resetForm();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setUrl(row.url);
    setTitle(row.title);
    setDate(row.date);
    setNote(row.note);
    setAddToTimeline(row.addToTimeline !== false);
    setShareOpen((row.sharedWith || []).length > 0);
    setSharedWith(row.sharedWith || []);
  }

  async function remove(id) {
    const next = items.filter((x) => x.id !== id);
    await persistList(next);
    try {
      await deleteEvent(id);
    } catch {
      /* ignore */
    }
    if (editingId === id) resetForm();
    if (openId === id) setOpenId(null);
  }

  async function saveShare(row, nextShared) {
    const nextRow = { ...row, sharedWith: nextShared };
    const next = items.map((x) => (x.id === row.id ? nextRow : x));
    await persistList(next);
    await persistTimeline(nextRow);
  }

  async function openVideo(link) {
    try {
      await Linking.openURL(link);
    } catch {
      Alert.alert('Could not open', link);
    }
  }

  const sorted = [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Timeline</Text>
        <Text style={styles.heading}>YouTube</Text>
        <Text style={styles.intro}>
          Your uploads. Link, note, share with friends. Not the same as TV & films watched.
        </Text>

        <Text style={styles.label}>{editingId ? 'Edit upload' : 'Your upload'}</Text>
        <Text style={styles.field}>Video link</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://youtu.be/…"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.field}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Keys on a stick — take 2"
          placeholderTextColor="#64748b"
        />

        <Text style={styles.field}>Uploaded (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
        <Text style={styles.hint}>Shown as {date ? formatUk(date) : '—'}</Text>

        <Text style={styles.field}>Note</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={note}
          onChangeText={setNote}
          placeholder="What you kept, who it’s for…"
          placeholderTextColor="#64748b"
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.toggle} onPress={() => setAddToTimeline((v) => !v)}>
          <View style={[styles.box, addToTimeline && styles.boxOn]} />
          <Text style={styles.toggleText}>Also add to timeline</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toggle} onPress={() => setShareOpen((v) => !v)}>
          <View style={[styles.box, shareOpen && styles.boxOn]} />
          <Text style={styles.toggleText}>Share view with friends</Text>
        </TouchableOpacity>
        {shareOpen
          ? SAMPLE_SHARE_FRIENDS.map((f) => (
              <TouchableOpacity key={f.id} style={styles.friendRow} onPress={() => toggleFriend(f.id)}>
                <Text style={styles.bodyStrong}>{f.name}</Text>
                <Text style={sharedWith.includes(f.id) ? styles.accent : styles.hint}>
                  {sharedWith.includes(f.id) ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            ))
          : null}
        {shareOpen ? (
          <Text style={styles.hint}>Friends see your note and the link. They do not get YouTube comments.</Text>
        ) : null}

        <TouchableOpacity style={[styles.button, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save upload'}</Text>
        </TouchableOpacity>
        {editingId ? (
          <TouchableOpacity onPress={resetForm}>
            <Text style={styles.cancel}>Cancel edit</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.subHead}>Your uploads</Text>
        {sorted.length === 0 ? (
          <Text style={styles.hint}>Nothing saved yet.</Text>
        ) : (
          sorted.map((row) => {
            const open = openId === row.id;
            const names = SAMPLE_SHARE_FRIENDS.filter((f) => (row.sharedWith || []).includes(f.id)).map(
              (f) => f.name
            );
            return (
              <View key={row.id} style={styles.card}>
                <TouchableOpacity style={styles.cardTop} onPress={() => setOpenId(open ? null : row.id)}>
                  <Image source={{ uri: row.thumbnail }} style={styles.thumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bodyStrong}>{row.title}</Text>
                    <Text style={styles.hint}>{formatUk(row.date)}</Text>
                    {row.note ? (
                      <Text style={styles.meta} numberOfLines={2}>
                        {row.note}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                <View style={styles.chipRow}>
                  <TouchableOpacity style={styles.openBtn} onPress={() => openVideo(row.url)}>
                    <Text style={styles.openText}>Open</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, open && styles.chipOn]}
                    onPress={() => setOpenId(open ? null : row.id)}
                  >
                    <Text style={[styles.chipText, open && styles.chipTextOn]}>Note</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, (row.sharedWith || []).length > 0 && styles.chipOn]}
                    onPress={() => setOpenId(row.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        (row.sharedWith || []).length > 0 && styles.chipTextOn,
                      ]}
                    >
                      Share
                    </Text>
                  </TouchableOpacity>
                  {row.addToTimeline ? (
                    <View style={styles.chipOn}>
                      <Text style={styles.chipTextOn}>On timeline</Text>
                    </View>
                  ) : null}
                </View>
                {open ? (
                  <View style={styles.detail}>
                    <Text style={styles.meta}>{row.note || 'No note yet.'}</Text>
                    <Text style={styles.hint}>{row.url}</Text>
                    <Text style={styles.kicker}>Share this view</Text>
                    {SAMPLE_SHARE_FRIENDS.map((f) => {
                      const on = (row.sharedWith || []).includes(f.id);
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={styles.friendRow}
                          onPress={() => {
                            const next = on
                              ? (row.sharedWith || []).filter((id) => id !== f.id)
                              : [...(row.sharedWith || []), f.id];
                            saveShare(row, next);
                          }}
                        >
                          <Text style={styles.bodyStrong}>{f.name}</Text>
                          <Text style={on ? styles.accent : styles.hint}>{on ? 'On' : 'Off'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {names.length ? <Text style={styles.hint}>Shared with {names.join(', ')}</Text> : null}
                    <View style={styles.chipRow}>
                      <TouchableOpacity onPress={() => startEdit(row)}>
                        <Text style={styles.accent}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => remove(row.id)}>
                        <Text style={styles.delete}>Delete</Text>
                      </TouchableOpacity>
                      {row.addToTimeline ? (
                        <TouchableOpacity onPress={() => navigation.navigate('ShareEvent', { event: { id: row.id, title: row.title, source: 'youtube' } })}>
                          <Text style={styles.hint}>Invite code</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
      <HomeFab navigation={navigation} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 96 },
  kicker: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '700', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 8 },
  label: { color: '#93c5fd', fontSize: 12, fontWeight: '700', marginTop: 16, textTransform: 'uppercase' },
  field: { color: '#94a3b8', fontSize: 14, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2f55',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
  },
  area: { minHeight: 90 },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#3b82f6' },
  boxOn: { backgroundColor: '#3b82f6' },
  toggleText: { color: '#e2e8f0', fontSize: 15 },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { color: '#94a3b8', textAlign: 'center', marginTop: 10 },
  subHead: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginTop: 28, marginBottom: 8 },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2f55',
    padding: 12,
    marginTop: 10,
  },
  cardTop: { flexDirection: 'row', gap: 10 },
  thumb: { width: 112, height: 64, borderRadius: 8, backgroundColor: '#0f1024' },
  bodyStrong: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  meta: { color: '#94a3b8', fontSize: 13, marginTop: 4, lineHeight: 18 },
  accent: { color: '#93c5fd', fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e3a5f',
  },
  chipText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#93c5fd', fontSize: 13, fontWeight: '700' },
  openBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  openText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  detail: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#2e2f55', paddingTop: 10 },
  delete: { color: '#f87171', fontWeight: '600' },
});
