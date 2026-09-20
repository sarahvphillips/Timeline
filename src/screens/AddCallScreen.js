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
import CallAudioField from '../components/CallAudioField';
import LabelPicker from '../components/LabelPicker';
import { saveEvent, getEvents, deleteEvent } from '../services/eventService';
import { getPeople, findPerson, patchPerson } from '../services/peopleService';
import { formatUk } from '../services/dateSpanService';
import { createEventShare } from '../services/shareService';
import {
  getRewards,
  spendShopItem,
  hasPerk,
  CALL_RECORDING_COST,
  CALL_RECORDING_PERK,
} from '../services/rewardsService';

const CATEGORIES = [
  { id: 'personal', label: 'Personal' },
  { id: 'friends', label: 'Friends' },
  { id: 'family', label: 'Family' },
  { id: 'work', label: 'Work' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'other', label: 'Other' },
];

const QUICK_CONTACTS = ['Uber delivery', 'Deliveroo', 'Amazon', 'Driver', 'Unknown'];

const DIRECTIONS = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'missed', label: 'Missed' },
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

function callTitle(direction, who) {
  if (direction === 'outgoing') return `Outgoing to ${who}`;
  if (direction === 'missed') return `Missed from ${who}`;
  return `Incoming from ${who}`;
}

function durationLabel(minutes, seconds) {
  const m = Number(minutes) || 0;
  const s = Number(seconds) || 0;
  if (!m && !s) return 'duration unknown';
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function AddCallScreen({ navigation, route }) {
  const existing = route.params?.event || null;
  const [direction, setDirection] = useState(existing?.callDirection || 'incoming');
  const [contact, setContact] = useState(existing?.callContact || '');
  const [number, setNumber] = useState(existing?.callNumber || '');
  const [date, setDate] = useState(eventToDateTime(existing?.date).date);
  const [time, setTime] = useState(existing?.callTime || eventToDateTime(existing?.date).time);
  const [minutes, setMinutes] = useState(
    existing?.callMinutes != null && existing.callMinutes !== '0' ? String(existing.callMinutes) : ''
  );
  const [seconds, setSeconds] = useState(
    existing?.callSeconds != null && existing.callSeconds !== '0' ? String(existing.callSeconds) : ''
  );
  const [note, setNote] = useState(existing?.description || existing?.callNote || '');
  const [category, setCategory] = useState(existing?.category || 'personal');
  const [location, setLocation] = useState(existing?.callLocation || '');
  const [shareThis, setShareThis] = useState(!!existing?.sharedWithFriend);
  const [labels, setLabels] = useState(
    Array.isArray(existing?.labels) ? existing.labels.filter((l) => l !== 'Call') : []
  );
  const [audioUri, setAudioUri] = useState(existing?.audioUri || existing?.videoUri || '');
  const [audioName, setAudioName] = useState(existing?.audioName || '');
  const [audioKind, setAudioKind] = useState(existing?.audioKind || (existing?.videoUri ? 'video' : 'audio'));
  const [people, setPeople] = useState([]);
  const [logged, setLogged] = useState([]);
  const [saving, setSaving] = useState(false);
  const [matched, setMatched] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [unlocking, setUnlocking] = useState(false);

  const load = useCallback(async () => {
    const [list, events, rew] = await Promise.all([getPeople(), getEvents(), getRewards()]);
    setPeople(list);
    setRewards(rew);
    setLogged(
      (events || [])
        .filter((e) => e.source === 'call')
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    setMatched(findPerson(people, { contact, number }));
  }, [people, contact, number]);

  useEffect(() => {
    if (existing) return;
    setShareThis(Boolean(matched?.autoShareCalls));
  }, [matched?.id, matched?.autoShareCalls, existing]);

  const reset = () => {
    setDirection('incoming');
    setContact('');
    setNumber('');
    setDate(todayIso());
    setTime(nowClock());
    setMinutes('');
    setSeconds('');
    setNote('');
    setCategory('personal');
    setLocation('');
    setShareThis(false);
    setLabels([]);
    setAudioUri('');
    setAudioName('');
    setAudioKind('audio');
  };

  const handleSave = async () => {
    const who = contact.trim() || number.trim();
    if (!who) {
      Alert.alert(
        'Who was it?',
        'Add a name, Uber delivery, or a number. They do not have to be on People.'
      );
      return;
    }
    const mins = Number(minutes) || 0;
    const secs = Number(seconds) || 0;
    if (direction !== 'missed' && mins <= 0 && secs <= 0) {
      Alert.alert('Length of call', 'Please add the length of the call.');
      return;
    }
    const friend = findPerson(people, { contact, number });
    const hhmm = time.length >= 5 ? time.slice(0, 5) : nowClock();
    const iso = `${date}T${hhmm}:00`;
    setSaving(true);
    try {
      const saved = await saveEvent({
        id: existing?.id,
        title: callTitle(direction, who),
        description: note.trim() || durationLabel(minutes, seconds),
        date: new Date(iso).toISOString(),
        category,
        source: 'call',
        labels: Array.from(new Set(['Call', ...labels])),
        nextAction: 'none',
        callDirection: direction,
        callContact: who,
        callNumber: number.trim(),
        callTime: hhmm,
        callMinutes: String(Number(minutes) || 0),
        callSeconds: String(Number(seconds) || 0),
        callNote: note.trim(),
        callLocation: location.trim(),
        audioUri: audioKind === 'video' ? undefined : audioUri || undefined,
        videoUri: audioKind === 'video' ? audioUri || undefined : undefined,
        audioName: audioName || undefined,
        audioKind,
        personId: friend?.id || '',
        sharedWithFriend: Boolean(friend && shareThis),
      });
      if (friend && shareThis && (friend.onApp || friend.linkedUid)) {
        try {
          await createEventShare(saved);
        } catch (e) {
          console.warn('Call share skipped', e);
        }
      }
      await load();
      if (!existing) reset();
      Alert.alert('Saved', 'Call is on the timeline.');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save this call.');
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
      if (window.confirm('Delete this call log?')) run();
      return;
    }
    Alert.alert('Delete call', 'Remove this call from the timeline?', [
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
    await patchPerson(p.id, { autoShareCalls: !p.autoShareCalls });
    await load();
  };

  const friendFor = (item) => people.find((p) => p.id === item.personId) || null;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Home</Text>
        <Text style={styles.heading}>{existing ? 'Edit phone call' : 'Add phone call'}</Text>
        <Text style={styles.intro}>
          The other person can be anyone — a friend, Uber delivery, a driver. They do not have to be
          on People.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Direction</Text>
          <View style={styles.row}>
            {DIRECTIONS.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.chip, direction === d.id && styles.chipOn]}
                onPress={() => setDirection(d.id)}
              >
                <Text style={[styles.chipText, direction === d.id && styles.chipTextOn]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Who was the call with?</Text>
          <TextInput
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder="Name, Uber delivery, driver…"
            placeholderTextColor="#64748b"
          />
          <View style={styles.row}>
            {QUICK_CONTACTS.map((name) => (
              <TouchableOpacity
                key={name}
                style={[styles.chip, contact === name && styles.chipOn]}
                onPress={() => {
                  setContact(name);
                  if (name !== 'Unknown') setCategory('delivery');
                }}
              >
                <Text style={[styles.chipText, contact === name && styles.chipTextOn]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
            <Text style={styles.hint}>
              Not on People — that’s fine. One-off callers and deliveries still save.
            </Text>
          ) : null}

          {matched ? (
            <TouchableOpacity style={styles.shareRow} onPress={() => setShareThis((v) => !v)}>
              <View style={[styles.box, shareThis && styles.boxOn]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.shareLabel}>Share this call with {matched.name}</Text>
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
          <Text style={styles.hint}>
            Shown as {date ? formatUk(date) : '—'} {time}
          </Text>

          {direction !== 'missed' ? (
            <>
              <Text style={styles.label}>Length of call</Text>
              <View style={styles.two}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={minutes}
                  onChangeText={setMinutes}
                  placeholder="Minutes"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={seconds}
                  onChangeText={setSeconds}
                  placeholder="Seconds"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                />
              </View>
              <Text style={styles.hint}>Needed unless this is a missed call.</Text>
            </>
          ) : (
            <Text style={styles.hint}>Missed calls have no duration.</Text>
          )}

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
            placeholder="Or type a place"
            placeholderTextColor="#64748b"
          />

          <CallAudioField
            audioUri={audioUri}
            audioName={audioName}
            audioKind={audioKind}
            unlocked={hasPerk(rewards, CALL_RECORDING_PERK)}
            credits={rewards?.credits || 0}
            cost={CALL_RECORDING_COST}
            unlocking={unlocking}
            onUnlock={async () => {
              if (unlocking) return;
              setUnlocking(true);
              try {
                const next = await spendShopItem(CALL_RECORDING_PERK);
                setRewards(next);
                Alert.alert('Unlocked', `Call recordings are on. Credits left: ${next.credits}.`);
              } catch (e) {
                if (e?.code === 'NEED_CREDITS') {
                  Alert.alert('Not enough credits', e.message);
                } else if (e?.code === 'OWNED') {
                  Alert.alert('Already yours', 'Call recordings are already unlocked.');
                } else {
                  Alert.alert('Shop', e?.message || 'Could not unlock.');
                }
              } finally {
                setUnlocking(false);
              }
            }}
            onShop={() => navigation.navigate('CreditsShop')}
            onChange={({ uri, name, kind }) => {
              setAudioUri(uri || '');
              setAudioName(name || '');
              setAudioKind(kind || 'audio');
            }}
          />

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[styles.input, styles.body]}
            value={note}
            onChangeText={setNote}
            placeholder="What the call was about"
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

        <Text style={styles.listTitle}>Logged calls</Text>
        {logged.length === 0 ? (
          <Text style={styles.hint}>None yet. Match a Person by name or number to link their card.</Text>
        ) : (
          logged.map((item) => {
            const friend = friendFor(item);
            return (
              <View key={item.id} style={styles.log}>
                <Text style={styles.kicker}>
                  {item.callDirection || 'incoming'} · {item.category}
                </Text>
                <Text style={styles.matchName}>{item.callContact || item.title}</Text>
                {item.callNumber ? <Text style={styles.meta}>{item.callNumber}</Text> : null}
                <Text style={styles.meta}>
                  {item.date ? formatUk(String(item.date).slice(0, 10)) : ''} {item.callTime || ''} ·{' '}
                  {durationLabel(item.callMinutes, item.callSeconds)}
                </Text>
                {item.callLocation ? <Text style={styles.meta}>Location · {item.callLocation}</Text> : null}
                {item.audioUri || item.videoUri ? (
                  <Text style={styles.audioFlag}>
                    {item.audioKind === 'video' ? 'Screen recording on this device' : 'Recording on this device'}
                  </Text>
                ) : null}
                {item.description ? <Text style={styles.note}>{item.description}</Text> : null}
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
          <Text style={styles.listTitle}>Auto-share calls</Text>
          <Text style={styles.intro}>
            The Timeline friends listed below have been set to always Auto-Share calls (when Auto can
            be seen on the right). Each call still has the option to not be shared individually.
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
                <View style={[styles.autoPill, p.autoShareCalls && styles.autoPillOn]}>
                  <Text style={[styles.autoPillText, p.autoShareCalls && styles.autoPillTextOn]}>
                    {p.autoShareCalls ? 'Auto' : 'Off'}
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
  body: { minHeight: 72, textAlignVertical: 'top' },
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
    backgroundColor: '#fb923c',
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
  note: { color: '#e2e8f0', fontSize: 14, marginTop: 6 },
  audioFlag: { color: '#86efac', fontSize: 12, fontWeight: '700', marginTop: 6 },
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
