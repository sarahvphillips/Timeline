import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import {
  savePerson,
  deletePerson,
  patchPerson,
  importFromDateCircle,
  addPersonToDateCircle,
  parseBirthday,
  createJoinInvite,
  syncAcceptedJoins,
} from '../services/peopleService';
import { daysUntilNext, formatUk } from '../services/dateSpanService';
import { saveEvent } from '../services/eventService';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PeopleScreen({ navigation }) {
  const [people, setPeople] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    const list = await syncAcceptedJoins();
    setPeople(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setBirthday('');
    setNote('');
    setEditingId(null);
  };

  const fillForm = (p) => {
    setEditingId(p.id);
    setName(p.name);
    setPhone(p.phone);
    setEmail(p.email);
    setBirthday(p.birthday ? formatUk(p.birthday) : '');
    setNote(p.note);
  };

  const handleSave = async () => {
    const label = name.trim();
    if (!label) {
      Alert.alert('Need a name', 'Name or initials first.');
      return;
    }
    const iso = parseBirthday(birthday);
    if (birthday.trim() && !iso) {
      Alert.alert('Birthday', 'Use DD/MM/YYYY.');
      return;
    }
    setSaving(true);
    try {
      const saved = await savePerson({
        id: editingId || undefined,
        name: label,
        phone,
        email,
        birthday: iso,
        note,
      });
      await load();
      reset();
      Alert.alert(editingId ? 'Saved' : 'Added', `${saved.name} is on your people list.`);
    } catch (e) {
      Alert.alert(
        e?.code === 'DUPLICATE_PERSON' ? 'Already listed' : 'Error',
        e?.message || 'Could not save this person.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (p) => {
    const run = async () => {
      const next = await deletePerson(p.id);
      setPeople(next);
      if (editingId === p.id) reset();
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove ${p.name} from People?`)) run();
      return;
    }
    Alert.alert('Remove person', `Remove ${p.name} from People?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run },
    ]);
  };

  const handleInvite = async (p) => {
    try {
      const result = await createJoinInvite(p);
      try {
        await Share.share({ message: result.text });
      } catch {
        Alert.alert('Join code', result.text);
      }
      setCopiedId(p.id);
      await load();
    } catch (e) {
      Alert.alert(
        'Invite not ready',
        e?.message || 'Could not create a join code. Check you are signed in and online, then try again.'
      );
    }
  };

  const handleImportWheel = async () => {
    const { added, list } = await importFromDateCircle();
    setPeople(list);
    Alert.alert(
      'Date circle',
      added ? `Added ${added} ${added === 1 ? 'person' : 'people'} from the wheel.` : 'Everyone on the wheel is already here.'
    );
  };

  const handleToWheel = async (p) => {
    try {
      await addPersonToDateCircle(p);
      await load();
      Alert.alert('Date circle', `${p.name} is on the wheel.`);
    } catch (e) {
      Alert.alert('Date circle', e?.message || 'Could not add them.');
    }
  };

  const handleBirthdayEvent = async (p) => {
    if (!p.birthday) {
      Alert.alert('Birthday', 'Add a birthday first.');
      return;
    }
    try {
      await saveEvent({
        title: `${p.name} birthday`,
        description: `People · ${p.name}${p.note ? `\n${p.note}` : ''}`,
        date: `${p.birthday}T12:00:00.000Z`,
        category: 'family',
        source: 'people',
        labels: ['People', 'Birthday'],
        nextAction: 'none',
        personId: p.id,
      });
      Alert.alert('Timeline', `Birthday for ${p.name} is on the timeline.`);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not add the birthday event.');
    }
  };

  const toggleAuto = async (p, field) => {
    await patchPerson(p.id, { [field]: !p[field] });
    await load();
  };

  const today = todayIso();

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Home</Text>
        <Text style={styles.heading}>People</Text>
        <Text style={styles.intro}>
          Real-life friends, even if they don’t use Timeline. They can sit under events, SMS, calls,
          and the date circle. Invite is optional.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit person' : 'Add person'}</Text>
          <Text style={styles.label}>Name or initials</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. S.P or Frigg"
            placeholderTextColor="#64748b"
            autoCapitalize="words"
          />
          <Text style={styles.label}>Phone (optional)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="For matching SMS later"
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
          />
          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="If they might use Timeline"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.label}>Birthday (DD/MM/YYYY)</Text>
          <TextInput
            style={styles.input}
            value={birthday}
            onChangeText={setBirthday}
            placeholder="14/11/1986"
            placeholderTextColor="#64748b"
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={note}
            onChangeText={setNote}
            placeholder="How you know them, nickname…"
            placeholderTextColor="#64748b"
            multiline
          />
          <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : editingId ? 'Save person' : 'Add person'}</Text>
          </TouchableOpacity>
          {editingId ? (
            <TouchableOpacity style={styles.ghostBtn} onPress={reset}>
              <Text style={styles.ghostText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity style={styles.secondary} onPress={handleImportWheel}>
          <Text style={styles.secondaryText}>Import from date circle</Text>
        </TouchableOpacity>

        <Text style={styles.listTitle}>Your people</Text>
        {people.length === 0 ? (
          <Text style={styles.empty}>Nobody yet. Add someone, or import the date-circle wheel.</Text>
        ) : (
          people.map((p) => {
            const until = p.birthday ? daysUntilNext(today, p.birthday) : null;
            return (
              <View key={p.id} style={styles.person}>
                <View style={styles.personTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{p.initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{p.name}</Text>
                    <Text style={styles.personStatus}>
                      {p.onApp
                        ? `Uses Timeline${p.linkedEmail ? ` · ${p.linkedEmail}` : ''}`
                        : 'Not on the app yet'}
                      {p.fromWheelId ? ' · on date circle' : ''}
                      {p.joinCode ? ` · code ${p.joinCode}` : p.inviteSent ? ' · invite sent' : ''}
                    </Text>
                  </View>
                </View>
                {p.phone ? <Text style={styles.meta}>{p.phone}</Text> : null}
                {p.email ? <Text style={styles.meta}>{p.email}</Text> : null}
                {p.birthday ? (
                  <Text style={styles.birthday}>
                    Birthday {formatUk(p.birthday)}
                    {until == null ? '' : until === 0 ? ' · today' : ` · ${until}d until next`}
                  </Text>
                ) : null}
                {p.note ? <Text style={styles.note}>{p.note}</Text> : null}

                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[styles.toggleChip, p.autoShareSms && styles.toggleChipOn]}
                    onPress={() => toggleAuto(p, 'autoShareSms')}
                  >
                    <Text style={[styles.toggleText, p.autoShareSms && styles.toggleTextOn]}>
                      SMS {p.autoShareSms ? 'Auto' : 'off'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleChip, p.autoShareCalls && styles.toggleChipOn]}
                    onPress={() => toggleAuto(p, 'autoShareCalls')}
                  >
                    <Text style={[styles.toggleText, p.autoShareCalls && styles.toggleTextOn]}>
                      Calls {p.autoShareCalls ? 'Auto' : 'off'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.autoHint}>
                  Auto on the right means new SMS or calls with this person default to shared. You can
                  still turn sharing off on a single item.
                </Text>

                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => fillForm(p)}>
                    <Text style={styles.link}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleInvite(p)}>
                    <Text style={styles.link}>{copiedId === p.id ? 'Code sent' : p.joinCode ? 'Resend code' : 'Invite'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleToWheel(p)}>
                    <Text style={styles.link}>Date circle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleBirthdayEvent(p)}>
                    <Text style={styles.link}>Birthday event</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(p)}>
                    <Text style={styles.delete}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
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
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2b4a',
    marginBottom: 12,
  },
  cardTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: '#0f1024',
    borderColor: '#2e2f55',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ghostBtn: { paddingVertical: 12, alignItems: 'center' },
  ghostText: { color: '#94a3b8', fontSize: 15 },
  secondary: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryText: { color: '#c4b5fd', fontWeight: '700' },
  listTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  empty: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  person: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2b4a',
  },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  personName: { color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  personStatus: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  meta: { color: '#cbd5e1', fontSize: 13 },
  birthday: { color: '#93c5fd', fontSize: 13, fontWeight: '600', marginTop: 4 },
  note: { color: '#e2e8f0', fontSize: 14, marginTop: 6 },
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  toggleChip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleChipOn: { backgroundColor: '#166534', borderColor: '#22c55e' },
  toggleText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  toggleTextOn: { color: '#dcfce7' },
  autoHint: { color: '#64748b', fontSize: 11, lineHeight: 15, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  link: { color: '#60a5fa', fontWeight: '700', fontSize: 13 },
  delete: { color: '#f87171', fontWeight: '700', fontSize: 13 },
});
