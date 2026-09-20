import React, { useCallback, useEffect, useState } from 'react';
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
import { saveEvent, getEvents, deleteEvent } from '../services/eventService';
import { getPeople, findPerson, patchPerson } from '../services/peopleService';
import { formatUk } from '../services/dateSpanService';
import { createEventShare } from '../services/shareService';

const CATEGORIES = [
  { id: 'personal', label: 'Personal' },
  { id: 'friends', label: 'Friends' },
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

function eventToDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return { date: todayIso(), time: nowClock() };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: d.toISOString().slice(0, 10),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function AddSmsScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [direction, setDirection] = useState(existing?.smsDirection || 'received');
  const [contact, setContact] = useState(existing?.smsContact || '');
  const [number, setNumber] = useState(existing?.smsNumber || '');
  const [date, setDate] = useState(eventToDateTime(existing?.date).date);
  const [time, setTime] = useState(existing?.smsTime || eventToDateTime(existing?.date).time);
  const [body, setBody] = useState(existing?.description || existing?.smsBody || '');
  const [category, setCategory] = useState(existing?.category || 'personal');
  const [location, setLocation] = useState(existing?.smsLocation || '');
  const [shareThis, setShareThis] = useState(!!existing?.sharedWithFriend);
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels) ? existing.labels.filter((l) => l !== 'SMS') : []
  );
  const [people, setPeople] = useState([]);
  const [logged, setLogged] = useState([]);
  const [saving, setSaving] = useState(false);
  const [matched, setMatched] = useState(null);

  const load = useCallback(async () => {
    const [list, events] = await Promise.all([getPeople(), getEvents()]);
    setPeople(list);
    setLogged(
      (events || [])
        .filter((e) => e.source === 'sms')
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const hit = findPerson(people, { contact, number });
    setMatched(hit);
  }, [people, contact, number]);

  useEffect(() => {
    if (existing) return;
    setShareThis(Boolean(matched?.autoShareSms));
  }, [matched?.id, matched?.autoShareSms, existing]);

  const reset = () => {
    setDirection('received');
    setContact('');
    setNumber('');
    setDate(todayIso());
    setTime(nowClock());
    setBody('');
    setCategory('personal');
    setLocation('');
    setShareThis(false);
    setLabels([]);
  };

  const handleSave = async () => {
    if (!body.trim() && !contact.trim()) {
      Alert.alert('Need a text', 'Paste the message or the contact name.');
      return;
    }
    const friend = findPerson(people, { contact, number });
    const who = contact.trim() || friend?.name || 'Unknown';
    const hhmm = time.length >= 5 ? time.slice(0, 5) : nowClock();
    const iso = `${date}T${hhmm}:00`;
    setSaving(true);
    try {
      const saved = await saveEvent({
        id: existing?.id,
        title: `${direction === 'sent' ? 'Sent to' : 'From'} ${who}`,
        description: body.trim(),
        date: new Date(iso).toISOString(),
        category,
        source: 'sms',
        labels: Array.from(new Set(['SMS', ...labels])),
        nextAction: 'none',
        smsDirection: direction,
        smsContact: who,
        smsNumber: number.trim(),
        smsTime: hhmm,
        smsBody: body.trim(),
        smsLocation: location.trim(),
        personId: friend?.id || '',
        sharedWithFriend: Boolean(friend && shareThis),
      });
      if (friend && shareThis && (friend.onApp || friend.linkedUid)) {
        try {
          await createEventShare(saved);
        } catch (e) {
          console.warn('SMS share skipped', e);
        }
      }
      await load();
      if (!existing) reset();
      Alert.alert('Saved', 'SMS is on the timeline.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save this text.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    const run = async () => {
      await deleteEvent(item.id);
      await load();
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Delete this SMS log?')) run();
      return;
    }
    Alert.alert('Delete SMS', 'Remove this text from the timeline?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  };

  const toggleLoggedShare = async (item) => {
    if (!item.personId) return;
    await saveEvent({ ...item, sharedWithFriend: !item.sharedWithFriend });
    await load();
  };

  const toggleAuto = async (p) => {
    await patchPerson(p.id, { autoShareSms: !p.autoShareSms });
    await load();
  };

  const friendFor = (item) => people.find((p) => p.id === item.personId) || null;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Home</Text>
        <Text style={styles.heading}>{existing ? 'Edit SMS' : 'Add SMS'}</Text>
        <Text style={styles.intro}>
          If the contact is already a Person, their profile is linked. Sharing defaults on only when
          that person has SMS Auto — you can still untick this one.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Direction</Text>
          <View style={styles.row}>
            {['received', 'sent'].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, direction === d && styles.chipOn]}
                onPress={() => setDirection(d)}
              >
                <Text style={[styles.chipText, direction === d && styles.chipTextOn]}>
                  {d === 'received' ? 'Received' : 'Sent'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Contact</Text>
          <TextInput
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder={direction === 'received' ? 'Who sent it?' : 'Who did you text?'}
            placeholderTextColor="#64748b"
          />
          <Text style={styles.label}>Number</Text>
          <TextInput
            style={styles.input}
            value={number}
            onChangeText={setNumber}
            placeholder="Optional — matches People"
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
          />

          {matched ? (
            <View style={styles.match}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{matched.initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.matchName}>{matched.name}</Text>
                <Text style={styles.meta}>
                  Known on Timeline
                  {matched.onApp ? ' · uses the app' : ' · not on the app yet'}
                </Text>
              </View>
            </View>
          ) : contact.trim() || number.trim() ? (
            <Text style={styles.hint}>Not on your People list yet. Add them there if you want a link.</Text>
          ) : null}

          {matched ? (
            <TouchableOpacity style={styles.shareRow} onPress={() => setShareThis((v) => !v)}>
              <View style={[styles.box, shareThis && styles.boxOn]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.shareLabel}>Share this SMS with {matched.name}</Text>
                <Text style={styles.hint}>Off still keeps them linked on your copy only.</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.label}>Date (YYYY-MM-DD) · Time (HH:MM)</Text>
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
              value={time}
              onChangeText={setTime}
              placeholder="HH:MM"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />
          </View>
          <Text style={styles.hint}>Shown as {date ? formatUk(date) : '—'} {time}</Text>

          <Text style={styles.label}>Location</Text>
          <View style={styles.row}>
            {['Home', 'Internet'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, location === p && styles.chipOn]}
                onPress={() => setLocation(location === p ? '' : p)}
              >
                <Text style={[styles.chipText, location === p && styles.chipTextOn]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Or type a place (high street, bus…)"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.body, direction === 'sent' && styles.bodySent]}
            value={body}
            onChangeText={setBody}
            placeholder="Paste or type the text"
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
        </View>

        <Text style={styles.listTitle}>Logged texts</Text>
        {logged.length === 0 ? (
          <Text style={styles.hint}>None yet. Match a Person by name or number to link their card.</Text>
        ) : (
          logged.map((item) => {
            const friend = friendFor(item);
            return (
              <View key={item.id} style={styles.log}>
                <Text style={styles.kicker}>
                  {item.smsDirection || 'received'} · {item.category}
                </Text>
                <Text style={styles.matchName}>{item.smsContact || item.title}</Text>
                {item.smsNumber ? <Text style={styles.meta}>{item.smsNumber}</Text> : null}
                <Text style={styles.meta}>
                  {item.date ? formatUk(String(item.date).slice(0, 10)) : ''} {item.smsTime || ''}
                </Text>
                {item.smsLocation ? <Text style={styles.meta}>Location · {item.smsLocation}</Text> : null}
                {item.description ? (
                  <Text style={[styles.bubble, item.smsDirection === 'sent' && styles.bubbleSent]}>
                    {item.description}
                  </Text>
                ) : null}
                {friend ? (
                  <Text style={styles.matchName}>
                    {friend.name}
                    {item.sharedWithFriend ? ' · shared' : ' · linked only'}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  {friend ? (
                    <TouchableOpacity onPress={() => toggleLoggedShare(item)}>
                      <Text style={styles.link}>
                        {item.sharedWithFriend ? 'Stop sharing' : `Share with ${friend.name}`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => handleDelete(item)}>
                    <Text style={styles.delete}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.card}>
          <Text style={styles.listTitle}>Auto-share SMS</Text>
          <Text style={styles.intro}>
            The Timeline friends listed below have been set to always Auto-Share SMS (when Auto can
            be seen on the right). Each SMS still has the option to not be shared individually.
          </Text>
          {people.length === 0 ? (
            <Text style={styles.hint}>Add people first — Home → People.</Text>
          ) : (
            people.map((p) => (
              <TouchableOpacity key={p.id} style={styles.autoRow} onPress={() => toggleAuto(p)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchName}>{p.name}</Text>
                  <Text style={styles.meta}>{p.phone || 'No number yet'}</Text>
                </View>
                <View style={[styles.autoPill, p.autoShareSms && styles.autoPillOn]}>
                  <Text style={[styles.autoPillText, p.autoShareSms && styles.autoPillTextOn]}>
                    {p.autoShareSms ? 'Auto' : 'Off'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 110 },
  kicker: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 12 },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2b4a',
    marginBottom: 16,
  },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: '#0f1024',
    borderColor: '#2e2f55',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 4,
  },
  body: { minHeight: 88, textAlignVertical: 'top' },
  bodySent: { textAlign: 'right' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  two: { flexDirection: 'row', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800' },
  matchName: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  meta: { color: '#94a3b8', fontSize: 13 },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 4 },
  shareRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748b',
    marginTop: 2,
  },
  boxOn: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  shareLabel: { color: '#e2e8f0', fontWeight: '700' },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  listTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  log: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2b4a',
  },
  bubble: {
    marginTop: 8,
    backgroundColor: '#0f1024',
    color: '#e2e8f0',
    padding: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  bubbleSent: { backgroundColor: '#1d4ed8', color: '#fff', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  link: { color: '#60a5fa', fontWeight: '700' },
  delete: { color: '#f87171', fontWeight: '700' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  autoPill: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  autoPillOn: { backgroundColor: '#166534', borderColor: '#22c55e' },
  autoPillText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  autoPillTextOn: { color: '#dcfce7' },
});
