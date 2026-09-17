import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import {
  daysUntilNext,
  daysBetweenBirthdays,
  daysBetweenAnniversaries,
  spanYmd,
  formatDmy,
  formatDob,
  digitSum,
  concatNumbers,
} from '../services/dateSpanService';
import { getWordNumbers, findPhrasesForNumber } from '../services/wordToIntService';
import { saveEvent } from '../services/eventService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAMPLE = [
  { id: 'ps', initials: 'PS', date: '1940-07-13', role: 'hub', angle: 0 },
  { id: 'sp', initials: 'S.P', date: '1986-11-14', role: 'ring', angle: -90 },
  { id: 'dh', initials: 'DH', date: '1972-05-08', role: 'ring', angle: 0 },
  { id: 'em', initials: 'EM', date: '1972-06-28', role: 'ring', angle: 90 },
  { id: 'dt', initials: 'DT', date: '1989-06-05', role: 'ring', angle: 180 },
];

const STORE = '@timeline_date_circle_people_v1';
const SIZE = 300;
const CX = 150;
const CY = 150;
const R = 112;
const NODE = 56;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nodePos(angle) {
  const rad = (angle * Math.PI) / 180;
  return {
    left: CX + R * Math.cos(rad) - NODE / 2,
    top: CY + R * Math.sin(rad) - NODE / 2,
  };
}

function hitsLabel(hits) {
  if (!hits.length) return 'no matching word yet';
  return hits.map((h) => h.phrase).join(', ');
}

export default function DateCircleScreen({ navigation }) {
  const [people, setPeople] = useState(SAMPLE);
  const [focus, setFocus] = useState('2026-04-16');
  const [excludeEnd, setExcludeEnd] = useState(true);
  const [picked, setPicked] = useState([]);
  const [initials, setInitials] = useState('');
  const [birth, setBirth] = useState('');
  const [words, setWords] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORE)
      .then((raw) => {
        if (!raw) return;
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) setPeople(list);
      })
      .catch(() => {});
    getWordNumbers()
      .then(setWords)
      .catch(() => {});
  }, []);

  const persist = (next) => {
    setPeople(next);
    AsyncStorage.setItem(STORE, JSON.stringify(next)).catch(() => {});
  };

  const hub = people.find((p) => p.role === 'hub') || people[0];
  const ring = people.filter((p) => p.role === 'ring');

  function tapPerson(id) {
    setPicked((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= 2) return [ids[1], id];
      return [...ids, id];
    });
  }

  const pair = useMemo(() => {
    if (picked.length !== 2) return null;
    const a = people.find((p) => p.id === picked[0]);
    const b = people.find((p) => p.id === picked[1]);
    if (!a || !b) return null;
    const untilA = daysUntilNext(focus, a.date, { excludeEndDate: excludeEnd });
    const untilB = daysUntilNext(focus, b.date, { excludeEndDate: excludeEnd });
    const ymd = spanYmd(a.date, b.date);
    return {
      a,
      b,
      untilA,
      untilB,
      birthdayGap: daysBetweenBirthdays(focus, a.date, b.date, { excludeEndDate: excludeEnd }),
      anniversaryDays: daysBetweenAnniversaries(a.date, b.date),
      ymd,
      dmy: formatDmy(ymd),
    };
  }, [picked, people, focus, excludeEnd]);

  const wordMath = useMemo(() => {
    if (!pair) return null;
    const sumA = digitSum(pair.untilA);
    const sumB = digitSum(pair.untilB);
    const joined = concatNumbers(sumA.total, sumB.total);
    return {
      sumA,
      sumB,
      joined,
      hitsA: findPhrasesForNumber(words, sumA.total),
      hitsB: findPhrasesForNumber(words, sumB.total),
      hitsJoined: findPhrasesForNumber(words, joined),
      hitsGap: findPhrasesForNumber(words, pair.birthdayGap),
      hitsAnn: findPhrasesForNumber(words, pair.anniversaryDays),
    };
  }, [pair, words]);

  function addPerson() {
    const label = initials.trim();
    const date = birth.trim();
    if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Need initials and date', 'Date as YYYY-MM-DD. Shown as DD/MM/YYYY on the wheel.');
      return;
    }
    const n = ring.length;
    const angle = n === 0 ? -90 : -90 + n * (360 / (n + 1));
    persist([
      ...people,
      { id: `p-${Date.now()}`, initials: label, date, role: 'ring', angle },
    ]);
    setInitials('');
    setBirth('');
  }

  async function saveWheel() {
    if (!pair) {
      Alert.alert('Pick two people', 'Tap two circles first.');
      return;
    }
    setSaving(true);
    try {
      await saveEvent({
        title: `${pair.a.initials} · ${pair.b.initials} · ${pair.dmy}`,
        description: [
          `Focus ${formatDob(focus)}`,
          `${pair.a.initials} ${formatDob(pair.a.date)} → ${pair.b.initials} ${formatDob(pair.b.date)}`,
          pair.dmy,
          `${pair.anniversaryDays}d between birthdays (year ignored)`,
          `${pair.birthdayGap}d between days-until (from focus)`,
        ].join('\n'),
        date: `${focus}T12:00:00.000Z`,
        category: 'wheel of dates',
        source: 'date_circle',
        labels: ['Wheel of dates'],
      });
      Alert.alert('Saved', 'Wheel of dates event on the timeline.');
    } catch {
      Alert.alert('Error', 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Date circle</Text>
      <Text style={styles.intro}>
        Top date = days left until birthdays. Tap two people. Spans as 14y 6m 6d. Dates as
        DD/MM/YYYY.
      </Text>
      <TouchableOpacity onPress={() => navigation.navigate('DateSpan')}>
        <Text style={styles.link}>Days between calculator</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Focus date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={focus}
        onChangeText={setFocus}
        placeholder={todayIso()}
        placeholderTextColor="#64748b"
        autoCapitalize="none"
      />
      <Text style={styles.hint}>Shown as {focus ? formatDob(focus) : '—'}</Text>

      <TouchableOpacity style={styles.toggle} onPress={() => setExcludeEnd((v) => !v)}>
        <View style={[styles.box, excludeEnd && styles.boxOn]} />
        <Text style={styles.toggleText}>Exclude the end date</Text>
      </TouchableOpacity>

      <View style={styles.wheel}>
        <View style={styles.ring} />
        {hub ? (
          <TouchableOpacity
            style={[styles.node, styles.hub, picked.includes(hub.id) && styles.nodeOn]}
            onPress={() => tapPerson(hub.id)}
          >
            <Text style={styles.nodeText}>{hub.initials}</Text>
            <Text style={styles.nodeMeta}>{formatDob(hub.date)}</Text>
          </TouchableOpacity>
        ) : null}
        {ring.map((p) => {
          const pos = nodePos(p.angle);
          const until = daysUntilNext(focus, p.date, { excludeEndDate: excludeEnd });
          const ymd = hub ? formatDmy(spanYmd(hub.date, p.date)) : '';
          return (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.node,
                styles.spoke,
                pos,
                picked.includes(p.id) && styles.nodeOn,
              ]}
              onPress={() => tapPerson(p.id)}
            >
              <Text style={styles.nodeText}>{p.initials}</Text>
              <Text style={styles.nodeMeta}>{until}d</Text>
              <Text style={styles.nodeYmd}>{ymd}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>Numbers on the ring = days until that birthday. Small 14y 6m 6d = span from the hub DoB.</Text>

      {pair ? (
        <View style={styles.card}>
          <Text style={styles.resultLabel}>Selected</Text>
          <Text style={styles.ymd}>{pair.dmy}</Text>
          <Text style={styles.meta}>
            {pair.a.initials} {formatDob(pair.a.date)} → {pair.b.initials} {formatDob(pair.b.date)}
          </Text>
          <Text style={styles.meta}>
            {pair.untilA}d until {pair.a.initials} · {pair.untilB}d until {pair.b.initials} (from{' '}
            {formatDob(focus)})
          </Text>
          <Text style={styles.meta}>
            {pair.birthdayGap}d between those two “days until” numbers
          </Text>
          <Text style={styles.meta}>
            {pair.anniversaryDays}d between birthdays (year ignored — does not move if you change the
            focus date)
          </Text>
          {wordMath ? (
            <View style={styles.wordBlock}>
              <Text style={styles.altTitle}>Word to int</Text>
              <Text style={styles.alt}>
                {pair.a.initials} {pair.untilA}d ({wordMath.sumA.parts})=({wordMath.sumA.total}){' '}
                {hitsLabel(wordMath.hitsA)}
              </Text>
              <Text style={styles.alt}>
                {pair.b.initials} {pair.untilB}d ({wordMath.sumB.parts})=({wordMath.sumB.total}){' '}
                {hitsLabel(wordMath.hitsB)}
              </Text>
              <Text style={styles.alt}>
                ({wordMath.sumA.total})({wordMath.sumB.total}) = {wordMath.joined}{' '}
                {hitsLabel(wordMath.hitsJoined)}
              </Text>
              <Text style={styles.alt}>
                span {pair.anniversaryDays} {hitsLabel(wordMath.hitsAnn)}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={saveWheel} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save wheel as event'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.hint}>Tap two circles for the span between them.</Text>
      )}

      <Text style={styles.label}>Add person</Text>
      <TextInput
        style={styles.input}
        value={initials}
        onChangeText={setInitials}
        placeholder="Initials e.g. KD"
        placeholderTextColor="#64748b"
      />
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        value={birth}
        onChangeText={setBirth}
        placeholder="DoB YYYY-MM-DD"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
      />
      <TouchableOpacity style={[styles.button, { marginTop: 10 }]} onPress={addPerson}>
        <Text style={styles.buttonText}>Add to wheel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    backgroundColor: '#0f1024',
    flexGrow: 1,
    paddingBottom: 40,
  },
  heading: { color: '#f8fafc', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  link: { color: '#93c5fd', fontSize: 15, fontWeight: '600', marginBottom: 16 },
  label: { color: '#a5b4fc', fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#1a1b36',
    borderColor: '#2e2f55',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6, marginBottom: 8, lineHeight: 18 },
  toggle: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#3b82f6',
    marginRight: 10,
  },
  boxOn: { backgroundColor: '#3b82f6' },
  toggleText: { color: '#e2e8f0', fontSize: 15 },
  wheel: {
    width: SIZE,
    height: SIZE,
    alignSelf: 'center',
    marginVertical: 12,
  },
  ring: {
    position: 'absolute',
    left: CX - R,
    top: CY - R,
    width: R * 2,
    height: R * 2,
    borderRadius: R,
    borderWidth: 1,
    borderColor: '#334155',
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hub: {
    position: 'absolute',
    left: CX - NODE / 2,
    top: CY - NODE / 2,
    backgroundColor: '#1e3a5f',
  },
  spoke: { position: 'absolute' },
  nodeOn: { borderColor: '#fbbf24', backgroundColor: '#312e81' },
  nodeText: { color: '#f8fafc', fontSize: 12, fontWeight: '700' },
  nodeMeta: { color: '#93c5fd', fontSize: 10 },
  nodeYmd: { color: '#cbd5e1', fontSize: 8 },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  resultLabel: { color: '#c4b5fd', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  ymd: { color: '#93c5fd', fontSize: 32, fontWeight: '800', marginBottom: 8 },
  meta: { color: '#94a3b8', fontSize: 14, marginBottom: 4, lineHeight: 20 },
  wordBlock: { marginTop: 10 },
  altTitle: { color: '#c4b5fd', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  alt: { color: '#e2e8f0', fontSize: 13, marginBottom: 4, lineHeight: 18 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
