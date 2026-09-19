import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import { saveEvent, deleteEvent } from '../services/eventService';
import {
  loadSpotify,
  saveSpotify,
  parseSpotify,
  openUrl,
  SAMPLE_SHARE_FRIENDS,
} from '../services/spotifyService';

const ACTIVITIES = [
  { id: 'listened', label: 'Listened' },
  { id: 'saved', label: 'Saved' },
  { id: 'playlist', label: 'Playlist' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatUk(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso || '');
  return `${Number(d)}/${Number(m)}/${y}`;
}

export default function SpotifyScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [items, setItems] = useState([]);
  const [url, setUrl] = useState(existing?.spotifyUrl || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [artist, setArtist] = useState(existing?.spotifyArtist || '');
  const [activity, setActivity] = useState(existing?.spotifyActivity || 'listened');
  const [date, setDate] = useState(existing?.date ? String(existing.date).slice(0, 10) : todayIso());
  const [note, setNote] = useState(existing?.spotifyNote || existing?.description || '');
  const [addToTimeline, setAddToTimeline] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedWith, setSharedWith] = useState(existing?.spotifySharedWith || []);
  const [editingId, setEditingId] = useState(existing?.id || null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parseSpotify(url), [url]);

  const reload = useCallback(async () => {
    setItems(await loadSpotify());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function resetForm() {
    setUrl('');
    setTitle('');
    setArtist('');
    setActivity('listened');
    setDate(todayIso());
    setNote('');
    setAddToTimeline(true);
    setShareOpen(false);
    setSharedWith([]);
    setEditingId(null);
  }

  async function persistList(next) {
    setItems(next);
    await saveSpotify(next);
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
      title: row.artist ? `${row.title} — ${row.artist}` : row.title,
      description: [row.activity, row.note, row.url, names ? `Shared with ${names}` : '']
        .filter(Boolean)
        .join('\n'),
      date: `${row.date}T12:00:00.000Z`,
      category: 'hobby',
      source: 'spotify',
      labels: ['Spotify'],
      nextAction: 'none',
      spotifyUrl: row.url,
      spotifyKind: row.kind,
      spotifyId: row.spotifyId,
      spotifyArtist: row.artist,
      spotifyActivity: row.activity,
      spotifyNote: row.note,
      spotifySharedWith: row.sharedWith,
    });
  }

  async function handleSave() {
    const hit = parseSpotify(url);
    if (!hit && !title.trim()) {
      Alert.alert('Need a link', 'Paste a Spotify link, or at least a title.');
      return;
    }
    const kind = hit?.kind || 'track';
    const row = {
      id: editingId || `sp-${Date.now()}`,
      kind,
      spotifyId: hit?.id || '',
      url: hit ? openUrl(hit.kind, hit.id) : url.trim(),
      title: title.trim() || `${kind} on Spotify`,
      artist: artist.trim(),
      activity,
      date,
      note: note.trim(),
      addToTimeline,
      sharedWith: shareOpen ? sharedWith : [],
    };
    setSaving(true);
    try {
      const next = [row, ...items.filter((x) => x.id !== row.id)];
      await persistList(next);
      await persistTimeline(row);
      resetForm();
      Alert.alert('Saved', row.addToTimeline ? 'On the Spotify list and the timeline.' : 'On the Spotify list.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Hobby</Text>
        <Text style={styles.heading}>Spotify</Text>
        <Text style={styles.intro}>
          Paste a track, album, or playlist. Not a live Spotify login — you log what you listened to
          or saved.
        </Text>

        <Text style={styles.label}>Spotify link</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://open.spotify.com/track/…"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
        {parsed ? (
          <Text style={styles.hint}>
            {parsed.kind} · {openUrl(parsed.kind, parsed.id)}
          </Text>
        ) : null}

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Track, album, or playlist"
          placeholderTextColor="#64748b"
        />
        <Text style={styles.label}>Artist (optional)</Text>
        <TextInput
          style={styles.input}
          value={artist}
          onChangeText={setArtist}
          placeholder="Artist or host"
          placeholderTextColor="#64748b"
        />

        <Text style={styles.label}>Activity</Text>
        <View style={styles.row}>
          {ACTIVITIES.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.chip, activity === a.id && styles.chipOn]}
              onPress={() => setActivity(a.id)}
            >
              <Text style={[styles.chipText, activity === a.id && styles.chipTextOn]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
        <Text style={styles.hint}>Shown as {date ? formatUk(date) : '—'}</Text>

        <Text style={styles.label}>Note</Text>
        <TextInput
          style={[styles.input, styles.body]}
          value={note}
          onChangeText={setNote}
          placeholder="Why you kept it, who sent it, a lyric…"
          placeholderTextColor="#64748b"
          multiline
        />

        <TouchableOpacity style={styles.check} onPress={() => setAddToTimeline((v) => !v)}>
          <View style={[styles.box, addToTimeline && styles.boxOn]} />
          <Text style={styles.checkLabel}>Also add to timeline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.check} onPress={() => setShareOpen((v) => !v)}>
          <View style={[styles.box, shareOpen && styles.boxOn]} />
          <Text style={styles.checkLabel}>Share view with friends</Text>
        </TouchableOpacity>
        {shareOpen
          ? SAMPLE_SHARE_FRIENDS.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.check}
                onPress={() =>
                  setSharedWith((list) =>
                    list.includes(f.id) ? list.filter((x) => x !== f.id) : [...list, f.id]
                  )
                }
              >
                <Text style={styles.checkLabel}>{f.name}</Text>
                <Text style={styles.hint}>{sharedWith.includes(f.id) ? 'On' : 'Off'}</Text>
              </TouchableOpacity>
            ))
          : null}

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>

        <Text style={styles.listTitle}>Logged</Text>
        {items.length === 0 ? (
          <Text style={styles.hint}>None yet. Paste an open.spotify.com link.</Text>
        ) : (
          items
            .slice()
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .map((row) => (
              <View key={row.id} style={styles.log}>
                <Text style={styles.kicker}>
                  {row.activity} · {row.kind}
                </Text>
                <Text style={styles.title}>{row.title}</Text>
                {row.artist ? <Text style={styles.hint}>{row.artist}</Text> : null}
                <Text style={styles.hint}>{formatUk(row.date)}</Text>
                {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
                {row.url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(row.url)}>
                    <Text style={styles.link}>Open in Spotify</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
        )}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 110 },
  kicker: {
    color: '#1db954',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 12 },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: '#1a1b36',
    borderColor: '#2e2f55',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  body: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#1db954', borderColor: '#1db954' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#052e16' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 4 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#64748b' },
  boxOn: { backgroundColor: '#1db954', borderColor: '#1db954' },
  checkLabel: { color: '#e2e8f0', fontWeight: '700' },
  button: {
    backgroundColor: '#1db954',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#052e16', fontWeight: '800', fontSize: 16 },
  listTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginTop: 24, marginBottom: 8 },
  log: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2b4a',
  },
  title: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  note: { color: '#e2e8f0', fontSize: 14, marginTop: 6 },
  link: { color: '#1db954', fontWeight: '700', marginTop: 8 },
});
