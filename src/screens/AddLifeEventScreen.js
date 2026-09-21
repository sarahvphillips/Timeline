import React, { useCallback, useMemo, useState } from 'react';
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
import ImageAttachField from '../components/ImageAttachField';
import { saveEvent, getEvents, deleteEvent } from '../services/eventService';
import { getPeople } from '../services/peopleService';
import { daysUntilNext, formatUk } from '../services/dateSpanService';
import { PLACE_PRESETS } from '../services/placesService';

export const LIFE_KINDS = [
  { id: 'birthday', label: 'Birthday', hint: 'Date of birth. Coming-up uses the next birthday from today.' },
  { id: 'house_move', label: 'House move', hint: 'Day you moved (or will move). Place is the address or area.' },
  { id: 'wedding', label: 'Wedding', hint: 'Ceremony or the day that mattered.' },
  { id: 'graduation', label: 'Graduation', hint: 'Ceremony or result day.' },
  { id: 'new_job', label: 'New job', hint: 'Start date, or the day you accepted.' },
  { id: 'new_baby', label: 'New baby', hint: 'Birth date, or the day you want on the timeline.' },
  { id: 'other', label: 'Other', hint: 'Any other life marker. Title says what it is.' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function categoryForKind(kindId) {
  if (kindId === 'birthday' || kindId === 'wedding' || kindId === 'new_baby') return 'family';
  if (kindId === 'new_job') return 'work';
  return 'personal';
}

function kindMeta(id) {
  return LIFE_KINDS.find((k) => k.id === id) || LIFE_KINDS[LIFE_KINDS.length - 1];
}

export default function AddLifeEventScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const startKind = existing?.lifeKind || route.params?.lifeKind || 'birthday';
  const [kind, setKind] = useState(startKind);
  const [title, setTitle] = useState(existing?.title || route.params?.title || '');
  const [date, setDate] = useState(
    existing?.date ? String(existing.date).slice(0, 10) : route.params?.date || todayIso(),
  );
  const [who, setWho] = useState(existing?.lifeWho || route.params?.who || '');
  const [personId, setPersonId] = useState(existing?.personId || route.params?.personId || '');
  const [place, setPlace] = useState(existing?.location || existing?.lifePlace || '');
  const [note, setNote] = useState(existing?.description || existing?.lifeNote || '');
  const [imageUri, setImageUri] = useState(existing?.imageUri || '');
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels) ? existing.labels.filter((l) => l !== 'Life') : [],
  );
  const [people, setPeople] = useState([]);
  const [logged, setLogged] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [list, events] = await Promise.all([getPeople(), getEvents()]);
    setPeople(list);
    setLogged(
      (events || [])
        .filter((e) => e.source === 'life')
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const reset = () => {
    setKind('birthday');
    setTitle('');
    setDate(todayIso());
    setWho('');
    setPersonId('');
    setPlace('');
    setNote('');
    setImageUri('');
    setLabels([]);
  };

  const pickPerson = (p) => {
    const on = personId === p.id;
    if (on) {
      setPersonId('');
      setWho('');
      return;
    }
    setPersonId(p.id);
    setWho(p.name);
    if (kind === 'birthday' && p.birthday) setDate(String(p.birthday).slice(0, 10));
  };

  const handleSave = async () => {
    const meta = kindMeta(kind);
    const label = title.trim() || (who.trim() ? `${meta.label}: ${who.trim()}` : meta.label);
    if (!date) {
      Alert.alert('Need a date', 'Use YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    try {
      await saveEvent({
        id: existing?.id,
        title: label,
        description: note.trim(),
        date: new Date(`${date}T12:00:00`).toISOString(),
        category: categoryForKind(kind),
        source: 'life',
        location: place.trim() || undefined,
        labels: Array.from(new Set(['Life', meta.label, ...labels])),
        nextAction: 'none',
        lifeKind: kind,
        lifeWho: who.trim(),
        lifePlace: place.trim(),
        lifeNote: note.trim(),
        personId: personId || '',
        imageUri: imageUri || undefined,
      });
      await load();
      if (!existing) reset();
      Alert.alert('Saved', `${label} is on the timeline under Life.`);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save this life event.');
    } finally {
      setSaving(false);
    }
  };

  const today = todayIso();
  const upcoming = useMemo(() => {
    const fromLife = logged
      .map((ev) => ({
        key: ev.id,
        title: ev.title,
        kind: ev.lifeKind,
        date: String(ev.date || '').slice(0, 10),
        until: ev.lifeKind === 'birthday' ? daysUntilNext(today, ev.date) : null,
        source: 'life',
        event: ev,
      }))
      .filter((ev) => ev.kind === 'birthday' || ev.date >= today);

    const usedPeople = new Set(logged.filter((e) => e.lifeKind === 'birthday' && e.personId).map((e) => e.personId));
    const fromPeople = people
      .filter((p) => p.birthday && !usedPeople.has(p.id))
      .map((p) => ({
        key: `person-${p.id}`,
        title: p.name,
        kind: 'birthday',
        date: String(p.birthday).slice(0, 10),
        until: daysUntilNext(today, p.birthday),
        source: 'person',
        person: p,
      }));

    return [...fromLife, ...fromPeople]
      .sort((a, b) => {
        const au = a.until ?? 9999;
        const bu = b.until ?? 9999;
        if (a.kind === 'birthday' && b.kind === 'birthday') return au - bu;
        return String(a.date).localeCompare(String(b.date));
      })
      .slice(0, 6);
  }, [logged, people, today]);

  const meta = kindMeta(kind);

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Life</Text>
        <Text style={styles.heading}>{existing ? 'Edit life event' : 'Life events'}</Text>
        <Text style={styles.intro}>
          Birthdays, house moves, weddings and the rest. Birthdays already on People show under Coming
          up until you save one here.
        </Text>

        {upcoming.length > 0 ? (
          <View style={styles.upBox}>
            <Text style={styles.label}>Coming up</Text>
            {upcoming.map((ev) => (
              <TouchableOpacity
                key={ev.key}
                style={styles.upRow}
                onPress={() => {
                  if (ev.source === 'life') navigation.push('AddLifeEvent', { event: ev.event });
                  else {
                    setKind('birthday');
                    setWho(ev.person.name);
                    setPersonId(ev.person.id);
                    setDate(String(ev.person.birthday).slice(0, 10));
                    setTitle(ev.person.name);
                  }
                }}
              >
                <Text style={styles.logTitle}>{ev.title}</Text>
                <Text style={styles.hint}>
                  {kindMeta(ev.kind).label}
                  {ev.until != null
                    ? ` · ${ev.until === 0 ? 'today' : `${ev.until}d until birthday`}`
                    : ` · ${formatUk(ev.date)}`}
                  {ev.source === 'person' ? ' · from People' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Kind</Text>
        <View style={styles.row}>
          {LIFE_KINDS.map((k) => (
            <TouchableOpacity
              key={k.id}
              style={[styles.chip, kind === k.id && styles.chipOn]}
              onPress={() => setKind(k.id)}
            >
              <Text style={[styles.chipText, kind === k.id && styles.chipTextOn]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>{meta.hint}</Text>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={who ? `${meta.label}: ${who}` : meta.label}
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

        <Text style={styles.label}>Who</Text>
        <View style={styles.row}>
          {people.length === 0 ? (
            <Text style={styles.hint}>Nobody on People yet.</Text>
          ) : (
            people.map((p) => {
              const on = personId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => pickPerson(p)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
        <TextInput
          style={styles.input}
          value={who}
          onChangeText={(t) => {
            setWho(t);
            setPersonId('');
          }}
          placeholder="Or type a name"
          placeholderTextColor="#64748b"
        />

        <Text style={styles.label}>Place</Text>
        <View style={styles.row}>
          {PLACE_PRESETS.slice(0, 3).map((p) => (
            <TouchableOpacity
              key={p.name}
              style={[styles.chip, place === p.name && styles.chipOn]}
              onPress={() => setPlace(place === p.name ? '' : p.name)}
            >
              <Text style={[styles.chipText, place === p.name && styles.chipTextOn]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={place}
          onChangeText={setPlace}
          placeholder="Address or area"
          placeholderTextColor="#64748b"
        />

        <Text style={styles.label}>Note</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={note}
          onChangeText={setNote}
          placeholder="Optional"
          placeholderTextColor="#64748b"
          multiline
        />

        <ImageAttachField
          label="Photo"
          uri={imageUri}
          onChange={(picked) => setImageUri(picked?.uri || '')}
        />
        <LabelPicker value={labels} onChange={setLabels} />

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save to timeline'}</Text>
        </TouchableOpacity>

        <Text style={styles.listTitle}>Saved life events</Text>
        {logged.length === 0 ? (
          <Text style={styles.hint}>None yet.</Text>
        ) : (
          logged.map((item) => (
            <View key={item.id} style={styles.log}>
              <TouchableOpacity onPress={() => navigation.push('AddLifeEvent', { event: item })}>
                <Text style={styles.logTitle}>{item.title}</Text>
                <Text style={styles.hint}>
                  {kindMeta(item.lifeKind).label} · {formatUk(item.date)}
                  {item.lifeWho ? ` · ${item.lifeWho}` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const run = () => deleteEvent(item.id).then(load);
                  if (Platform.OS === 'web' && window.confirm) {
                    if (window.confirm('Remove this life event?')) run();
                    return;
                  }
                  Alert.alert('Remove', 'Remove this life event from the timeline?', [
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

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 110 },
  kicker: {
    color: '#e879f9',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  upBox: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2b4a',
  },
  upRow: { paddingVertical: 6 },
  label: { color: '#e9d5ff', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  hint: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#86198f', borderColor: '#e879f9' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  button: {
    backgroundColor: '#86198f',
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
  delete: { color: '#f87171', fontWeight: '700', fontSize: 13, marginTop: 6 },
});
