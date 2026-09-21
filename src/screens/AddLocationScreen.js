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
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import LabelPicker from '../components/LabelPicker';
import { saveEvent, getEvents, deleteEvent } from '../services/eventService';
import { getPeople } from '../services/peopleService';
import { formatUk } from '../services/dateSpanService';
import { createEventShare } from '../services/shareService';
import { PLACE_PRESETS, parseMapsLink, mapsSearchUrl } from '../services/placesService';

const CATEGORIES = [
  { id: 'travel', label: 'Travel' },
  { id: 'personal', label: 'Personal' },
  { id: 'family', label: 'Family' },
  { id: 'work', label: 'Work' },
  { id: 'other', label: 'Other' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowClock() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AddLocationScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [name, setName] = useState(existing?.title || existing?.placeName || '');
  const [address, setAddress] = useState(existing?.placeAddress || '');
  const [mapsLink, setMapsLink] = useState(existing?.placeUrl || '');
  const [fromGoogle, setFromGoogle] = useState(!!existing?.fromGoogle);
  const [date, setDate] = useState(existing?.date ? String(existing.date).slice(0, 10) : todayIso());
  const [arrived, setArrived] = useState(existing?.placeArrived || nowClock());
  const [left, setLeft] = useState(existing?.placeLeft || '');
  const [note, setNote] = useState(existing?.description || existing?.placeNote || '');
  const [category, setCategory] = useState(existing?.category || 'travel');
  const [withIds, setWithIds] = useState(existing?.placeWithIds || []);
  const [shareThis, setShareThis] = useState(!!existing?.sharedWithFriend);
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels) ? existing.labels.filter((l) => l !== 'Places') : [],
  );
  const [people, setPeople] = useState([]);
  const [logged, setLogged] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [list, events] = await Promise.all([getPeople(), getEvents()]);
    setPeople(list);
    setLogged(
      (events || [])
        .filter((e) => e.source === 'location')
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const reset = () => {
    setName('');
    setAddress('');
    setMapsLink('');
    setFromGoogle(false);
    setDate(todayIso());
    setArrived(nowClock());
    setLeft('');
    setNote('');
    setCategory('travel');
    setWithIds([]);
    setShareThis(false);
    setLabels([]);
  };

  const applyMaps = (text) => {
    setMapsLink(text);
    const parsed = parseMapsLink(text);
    if (!parsed) return;
    setFromGoogle(true);
    if (parsed.name && !name.trim()) setName(parsed.name);
    if (parsed.url) setMapsLink(parsed.url);
  };

  const pickPreset = (p) => {
    setName(p.name);
    setAddress(p.address);
    setFromGoogle(false);
    setMapsLink('');
  };

  const handleSave = async () => {
    const label = name.trim();
    if (!label) {
      Alert.alert('Need a place', 'Type a name, or pick Home / Internet / high street.');
      return;
    }
    const hhmm = arrived.length >= 5 ? arrived.slice(0, 5) : nowClock();
    const iso = `${date}T${hhmm}:00`;
    const tagged = people.filter((p) => withIds.includes(p.id));
    setSaving(true);
    try {
      const saved = await saveEvent({
        id: existing?.id,
        title: label,
        description: note.trim() || address.trim(),
        date: new Date(iso).toISOString(),
        category,
        source: 'location',
        location: label,
        labels: Array.from(new Set(['Places', ...labels])),
        nextAction: 'none',
        placeName: label,
        placeAddress: address.trim(),
        placeUrl: mapsLink.trim(),
        placeArrived: hhmm,
        placeLeft: left.trim(),
        placeNote: note.trim(),
        fromGoogle,
        placeWithIds: withIds,
        sharedWithFriend: Boolean(shareThis && tagged.length),
      });
      if (shareThis) {
        for (const friend of tagged) {
          if (friend.onApp || friend.linkedUid) {
            try {
              await createEventShare(saved);
            } catch (e) {
              console.warn('Location share skipped', e);
            }
          }
        }
      }
      await load();
      if (!existing) reset();
      Alert.alert('Saved', `${label} is on the timeline under Places.`);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save this place.');
    } finally {
      setSaving(false);
    }
  };

  const openMaps = async (url, placeName) => {
    const href = url || mapsSearchUrl(placeName);
    if (!href) return;
    try {
      await Linking.openURL(href);
    } catch {
      Alert.alert('Maps', 'Could not open that link.');
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Places</Text>
        <Text style={styles.heading}>{existing ? 'Edit location' : 'Add location'}</Text>
        <Text style={styles.intro}>
          Home, Internet, or a named high-street place do not need Google. Paste a Maps share link
          if you have one. Google Maps Timeline history cannot be imported — Google closed that.
        </Text>

        <Text style={styles.label}>Quick places</Text>
        <View style={styles.row}>
          {PLACE_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.name}
              style={[styles.chip, name === p.name && styles.chipOn]}
              onPress={() => pickPreset(p)}
            >
              <Text style={[styles.chipText, name === p.name && styles.chipTextOn]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Paste a Google Maps link</Text>
        <TextInput
          style={styles.input}
          value={mapsLink}
          onChangeText={applyMaps}
          placeholder="maps.google.com / maps.app.goo.gl"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {fromGoogle ? <Text style={styles.accent}>Marked as from Google</Text> : null}

        <Text style={styles.label}>Place</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Place name"
          placeholderTextColor="#64748b"
        />
        <Text style={styles.label}>Address or area</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Optional"
          placeholderTextColor="#64748b"
        />

        <Text style={styles.label}>Date · arrived · left</Text>
        <View style={styles.two}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={arrived}
            onChangeText={setArrived}
            placeholder="HH:MM"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
        </View>
        <TextInput
          style={styles.input}
          value={left}
          onChangeText={setLeft}
          placeholder="Left (optional HH:MM)"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
        <Text style={styles.hint}>
          {date ? formatUk(date) : '—'} {arrived}
          {left ? ` – ${left}` : ''}
        </Text>

        <Text style={styles.label}>With (People)</Text>
        <View style={styles.row}>
          {people.length === 0 ? (
            <Text style={styles.hint}>Nobody on People yet.</Text>
          ) : (
            people.map((p) => {
              const on = withIds.includes(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() =>
                    setWithIds((ids) => (on ? ids.filter((id) => id !== p.id) : [...ids, p.id]))
                  }
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
        {withIds.length > 0 ? (
          <TouchableOpacity style={styles.checkRow} onPress={() => setShareThis((v) => !v)}>
            <Text style={styles.tick}>{shareThis ? '☑' : '☐'}</Text>
            <Text style={styles.checkText}>
              Share this visit with tagged people. Off still shows them as related on your copy.
            </Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.label}>Note</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={note}
          onChangeText={setNote}
          placeholder="A message to yourself"
          placeholderTextColor="#64748b"
          multiline
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.row}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, category === c.id && styles.chipOn]}
              onPress={() => setCategory(c.id)}
            >
              <Text style={[styles.chipText, category === c.id && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <LabelPicker value={labels} onChange={setLabels} />

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save to timeline'}</Text>
        </TouchableOpacity>

        <Text style={styles.listTitle}>Logged places</Text>
        {logged.length === 0 ? (
          <Text style={styles.hint}>None yet.</Text>
        ) : (
          logged.map((item) => (
            <View key={item.id} style={styles.log}>
              <TouchableOpacity onPress={() => navigation.push('AddLocation', { event: item })}>
                <Text style={styles.logTitle}>{item.title}</Text>
                <Text style={styles.hint}>
                  {formatUk(item.date)}
                  {item.placeArrived ? ` · ${item.placeArrived}` : ''}
                  {item.fromGoogle ? ' · from Google' : ''}
                </Text>
                {item.placeAddress ? <Text style={styles.meta}>{item.placeAddress}</Text> : null}
              </TouchableOpacity>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => openMaps(item.placeUrl, item.title)}>
                  <Text style={styles.link}>Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const run = () => deleteEvent(item.id).then(load);
                    if (Platform.OS === 'web' && window.confirm) {
                      if (window.confirm('Remove this place?')) run();
                      return;
                    }
                    Alert.alert('Remove', 'Remove this place from the timeline?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: run },
                    ]);
                  }}
                >
                  <Text style={styles.delete}>Remove</Text>
                </TouchableOpacity>
              </View>
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
    color: '#2dd4bf',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  hint: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
  accent: { color: '#2dd4bf', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: '#0a0a12',
    borderColor: '#2e2f55',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  two: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#0f766e', borderColor: '#2dd4bf' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  checkRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 },
  tick: { color: '#2dd4bf', fontSize: 18 },
  checkText: { color: '#94a3b8', fontSize: 13, flex: 1, lineHeight: 18 },
  button: {
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  listTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  log: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2b4a',
  },
  logTitle: { color: '#f8fafc', fontWeight: '700', fontSize: 16 },
  meta: { color: '#cbd5e1', fontSize: 13, marginTop: 2 },
  link: { color: '#2dd4bf', fontWeight: '700', fontSize: 13 },
  delete: { color: '#f87171', fontWeight: '700', fontSize: 13 },
});
