import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import {
  daysUntilNext,
  daysBetweenBirthdays,
  daysBetweenAnniversaries,
  spanYmd,
  spanDetail,
  formatDmy,
  formatDob,
  formatUk,
  formatSpan,
  formatCalendarLine,
  formatMonthLine,
  formatWeekLine,
  formatResultLine,
  digitSum,
  concatNumbers,
  getSpans,
} from '../services/dateSpanService';
import { getWordNumbers, findPhrasesForNumber } from '../services/wordToIntService';
import { saveEvent } from '../services/eventService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SAMPLE = [
  { id: 'ps', initials: 'PS', date: '1940-07-13', role: 'hub', angle: 0 },
  { id: 'sp', initials: 'S.P', date: '1986-11-14', role: 'ring', angle: -90 },
  { id: 'dh', initials: 'DH', date: '1972-05-08', role: 'ring', angle: 0 },
  { id: 'em', initials: 'EM', date: '1972-06-28', role: 'ring', angle: 90 },
  { id: 'dt', initials: 'DT', date: '1989-06-05', role: 'ring', angle: 180 },
];

const STORE = '@timeline_date_circle_v2';
const PAIR_STORE = '@timeline_date_circle_pairs_v1';
const NODE = 64;

const DATE_LAYERS = [
  { id: 'full', label: 'Full dates', color: '#93c5fd' },
  { id: 'year', label: 'Year ignored', color: '#86efac' },
  { id: 'focus', label: 'From top date', color: '#c4b5fd' },
  { id: 'saved', label: 'Saved days between', color: '#fbbf24' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function hitsLabel(hits) {
  if (!hits || !hits.length) return 'no matching word yet';
  return hits.map((h) => h.phrase).join(', ');
}

function Spoke({ x1, y1, x2, y2, color, thick, label, labelColor, bg }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const lx = x1 + dx * 0.58;
  const ly = y1 + dy * 0.58;
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: mx - length / 2,
          top: my - (thick || 1.5) / 2,
          width: length,
          height: thick || 1.5,
          backgroundColor: color,
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
      {label ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: lx - 46,
            top: ly - 10,
            width: 92,
            minHeight: 18,
            borderRadius: 4,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 1,
          }}
        >
          <Text style={{ color: labelColor, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
        </View>
      ) : null}
    </>
  );
}

export default function DateCircleScreen({ navigation }) {
  const [people, setPeople] = useState(SAMPLE);
  const [focus, setFocus] = useState('2026-04-16');
  const [excludeEnd, setExcludeEnd] = useState(true);
  const [picked, setPicked] = useState([]);
  const [initials, setInitials] = useState('');
  const [birth, setBirth] = useState('');
  const [savedPairs, setSavedPairs] = useState([]);
  const [words, setWords] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventDate, setEventDate] = useState(todayIso());
  const [eventImage, setEventImage] = useState('');
  const [useToday, setUseToday] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wheelSize, setWheelSize] = useState(320);
  const [ready, setReady] = useState(false);
  const [spans, setSpans] = useState([]);
  const [layers, setLayers] = useState(['full']);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.people?.length) setPeople(parsed.people);
          if (parsed.focus) setFocus(parsed.focus);
        }
        const pairsRaw = await AsyncStorage.getItem(PAIR_STORE);
        if (pairsRaw) {
          const list = JSON.parse(pairsRaw);
          if (Array.isArray(list)) setSavedPairs(list);
        }
        const w = await getWordNumbers();
        setWords(w || []);
        const saved = await getSpans();
        setSpans(Array.isArray(saved) ? saved : []);
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORE, JSON.stringify({ people, focus })).catch(() => {});
  }, [people, focus, ready]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(PAIR_STORE, JSON.stringify(savedPairs)).catch(() => {});
  }, [savedPairs, ready]);

  const hub = people.find((p) => p.role === 'hub') || people[0];
  const ring = people.filter((p) => p.id !== hub?.id);

  const birthdays = useMemo(() => {
    return [...people]
      .map((p) => ({
        ...p,
        until: daysUntilNext(focus, p.date, { excludeEndDate: excludeEnd }),
      }))
      .sort((a, b) => a.until - b.until);
  }, [people, focus, excludeEnd]);
  const nearest = birthdays.slice(0, 2);

  const spokePairs = useMemo(() => {
    const lines = [];
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        lines.push({
          a: people[i],
          b: people[j],
          span: spanYmd(people[i].date, people[j].date),
        });
      }
    }
    return lines;
  }, [people]);

  function toggleLayer(id) {
    setLayers((cur) => {
      if (cur.includes(id)) return cur.length === 1 ? cur : cur.filter((x) => x !== id);
      return [...cur, id];
    });
  }

  function measures(a, b) {
    if (!a?.date || !b?.date) {
      return { span: null, year: null, focusGap: null, saved: [] };
    }
    const span = spanYmd(a.date, b.date);
    const year = daysBetweenAnniversaries(a.date, b.date);
    const untilA = daysUntilNext(focus, a.date, { excludeEndDate: excludeEnd });
    const untilB = daysUntilNext(focus, b.date, { excludeEndDate: excludeEnd });
    const savedHits = spans.filter((item) => {
      const days = Number(item.totalDays);
      return days === year || days === span.totalDays;
    });
    return {
      span,
      year,
      focusGap: Math.abs(untilA - untilB),
      saved: savedHits,
    };
  }

  function layerLabel(a, b) {
    const m = measures(a, b);
    const parts = [];
    if (layers.includes('full') && m.span) parts.push(formatDmy(m.span));
    if (layers.includes('year') && m.year != null) parts.push(`${m.year}d`);
    if (layers.includes('focus') && m.focusGap != null) parts.push(`top ${m.focusGap}d`);
    if (layers.includes('saved')) {
      parts.push(m.saved.length ? m.saved.map((s) => s.title || `${s.totalDays}d`).join(', ') : '—');
    }
    const savedOn = layers.includes('saved') && m.saved.length > 0;
    const color = savedOn
      ? '#fbbf24'
      : DATE_LAYERS.find((layer) => layers.includes(layer.id))?.color || '#93c5fd';
    return { text: parts.join(' · '), color, savedOn, m };
  }

  function tap(id) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const pair = useMemo(() => {
    if (picked.length !== 2) return null;
    const a = people.find((p) => p.id === picked[0]);
    const b = people.find((p) => p.id === picked[1]);
    if (!a || !b) return null;
    const span = spanYmd(a.date, b.date);
    const detail = spanDetail(a.date, b.date, { excludeEndDate: excludeEnd });
    return {
      a,
      b,
      span,
      detail,
      untilA: daysUntilNext(focus, a.date, { excludeEndDate: excludeEnd }),
      untilB: daysUntilNext(focus, b.date, { excludeEndDate: excludeEnd }),
      birthdayGap: daysBetweenBirthdays(focus, a.date, b.date, { excludeEndDate: excludeEnd }),
      anniversaryDays: daysBetweenAnniversaries(a.date, b.date),
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
    const label = initials.trim().toUpperCase();
    if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(birth.trim())) {
      Alert.alert('Need initials and date', 'Date as YYYY-MM-DD. Shown as DD/MM/YYYY.');
      return;
    }
    const used = ring.map((p) => p.angle);
    let angle = -90;
    for (let i = 0; i < 12; i += 1) {
      const tryA = -90 + i * 30;
      if (!used.some((u) => Math.abs(u - tryA) < 15)) {
        angle = tryA;
        break;
      }
    }
    setPeople((list) => [
      ...list,
      { id: `${Date.now()}`, initials: label, date: birth.trim(), role: 'ring', angle },
    ]);
    setInitials('');
    setBirth('');
  }

  function setHub(id) {
    setPeople((list) => list.map((p) => ({ ...p, role: p.id === id ? 'hub' : 'ring' })));
  }

  function savePair() {
    if (!pair) return;
    setSavedPairs((list) => [
      {
        id: `${Date.now()}`,
        aInitials: pair.a.initials,
        aDate: pair.a.date,
        bInitials: pair.b.initials,
        bDate: pair.b.date,
        focus,
        excludeEnd,
        untilA: pair.untilA,
        untilB: pair.untilB,
        birthdayGap: pair.birthdayGap,
        fullSpan: formatSpan(pair.span),
        dmy: formatDmy(pair.span),
      },
      ...list,
    ]);
    Alert.alert('Saved', 'On the birthday-gap list — not the timeline.');
  }

  async function pickExtraImage() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setEventImage(res.assets[0].uri);
    } catch {
      Alert.alert('Could not open photos');
    }
  }

  async function addWheelEvent() {
    setSaving(true);
    const date = useToday ? todayIso() : eventDate;
    const title = pair
      ? `${pair.a.initials} · ${pair.b.initials} · ${formatDmy(pair.span)}`
      : `Wheel of dates · ${formatDob(focus)}`;
    try {
      await saveEvent({
        title,
        description: [
          `Focus ${formatDob(focus)}`,
          pair
            ? `${pair.a.initials} ${formatDob(pair.a.date)} → ${pair.b.initials} ${formatDob(pair.b.date)}`
            : '',
          pair ? formatDmy(pair.span) : '',
          pair ? `${pair.anniversaryDays}d between birthdays (year ignored)` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        date: `${date}T12:00:00.000Z`,
        category: 'wheel of dates',
        source: 'date_circle',
        labels: ['Wheel of dates'],
        imageUri: eventImage || undefined,
      });
      setEvents((list) => [
        { id: `${Date.now()}`, title, date, imageUri: eventImage },
        ...list,
      ]);
      Alert.alert('Saved', 'Wheel of dates event on the timeline.');
    } catch {
      Alert.alert('Error', 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const CX = wheelSize / 2;
  const CY = wheelSize / 2;
  const R = wheelSize * 0.38;

  function xy(p) {
    if (!p || p.role === 'hub' || p.id === hub?.id) return { x: CX, y: CY };
    const rad = (p.angle * Math.PI) / 180;
    return { x: CX + Math.cos(rad) * R, y: CY + Math.sin(rad) * R };
  }

  const pa = pair ? xy(pair.a) : null;
  const pb = pair ? xy(pair.b) : null;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>Timeline</Text>
      <Text style={styles.heading}>Date circle</Text>
      <Text style={styles.intro}>
        Side-feature. Top date = days left until birthdays. Tap two people for the gap between them.
        Spans show as 14y 6m 6d (YYy MMm DDd) with dates as DD/MM/YYYY.
      </Text>
      <View style={styles.rowLinks}>
        <TouchableOpacity onPress={() => navigation.navigate('DateSpan')}>
          <Text style={styles.link}>Days between</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('WordToInt')}>
          <Text style={styles.link}>Word to Int</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('People')}>
          <Text style={styles.link}>People</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Date at the top</Text>
        <TextInput
          style={styles.input}
          value={focus}
          onChangeText={setFocus}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
        <Text style={styles.hint}>Shown as {focus ? formatDob(focus) : '—'}</Text>
        <TouchableOpacity style={styles.toggle} onPress={() => setExcludeEnd((v) => !v)}>
          <View style={[styles.box, excludeEnd && styles.boxOn]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleText}>Exclude the end date</Text>
            <Text style={styles.hint}>
              Same as Days between. Off counts the birthday; on matches your 21d note.
            </Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.subHead}>Days left until birthday</Text>
        {nearest.map((p) => (
          <Text key={p.id} style={styles.untilBig}>
            {p.until === 0 ? 'Today' : `${p.until}d`} to {p.initials}
          </Text>
        ))}
        {birthdays.slice(2).map((p) => (
          <Text key={p.id} style={styles.untilSmall}>
            {p.until === 0 ? 'Today' : `${p.until}d`} to {p.initials}
          </Text>
        ))}
      </View>

      <Text style={styles.subHead}>Dates between — tap to combine</Text>
      <View style={styles.chipRow}>
        {DATE_LAYERS.map((layer) => {
          const on = layers.includes(layer.id);
          return (
            <TouchableOpacity
              key={layer.id}
              style={[styles.chip, on && { backgroundColor: layer.color, borderColor: layer.color }]}
              onPress={() => toggleLayer(layer.id)}
            >
              <Text style={[styles.chipText, on && { color: '#0a0a0b' }]}>{layer.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>
        Full dates keeps the years. Year ignored is the birthday gap. From top date uses the date in the box.
        Saved days between turns a spoke gold when a saved day-count matches that pair. Tap again to turn one off.
      </Text>

      <View
        style={[styles.wheel, { width: wheelSize, height: wheelSize }]}
        onLayout={(e) => {
          const w = Math.min(320, Math.round(e.nativeEvent.layout.width) || 320);
          if (w > 200 && Math.abs(w - wheelSize) > 8) setWheelSize(w);
        }}
      >
        <View
          style={[
            styles.ring,
            {
              left: CX - R,
              top: CY - R,
              width: R * 2,
              height: R * 2,
              borderRadius: R,
            },
          ]}
        />
        {ring.map((p) => {
          const a = xy(hub);
          const b = xy(p);
          const hot = picked.includes(p.id) && picked.includes(hub?.id);
          const shown = hub ? layerLabel(hub, p) : { text: '', color: '#334155', savedOn: false };
          return (
            <Spoke
              key={`spoke-${p.id}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              color={shown.savedOn ? '#fbbf24' : hot ? '#3b82f6' : '#334155'}
              thick={shown.savedOn || hot ? 3 : 1.5}
              label={shown.text}
              labelColor={shown.color}
              bg="#0f1024"
            />
          );
        })}
        {pair && pa && pb && pair.a.id !== hub?.id && pair.b.id !== hub?.id ? (
          <Spoke
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            color="#3b82f6"
            thick={3}
            label={layerLabel(pair.a, pair.b).text}
            labelColor={layerLabel(pair.a, pair.b).color}
            bg="#0f1024"
          />
        ) : null}

        {hub ? (
          <TouchableOpacity
            style={[
              styles.node,
              styles.hub,
              { left: CX - NODE / 2, top: CY - NODE / 2 },
              picked.includes(hub.id) && styles.nodeOn,
            ]}
            onPress={() => tap(hub.id)}
          >
            <Text style={styles.nodeText}>{hub.initials}</Text>
            <Text style={styles.nodeMeta}>{formatUk(hub.date)}</Text>
          </TouchableOpacity>
        ) : null}
        {ring.map((p) => {
          const pos = xy(p);
          const until = daysUntilNext(focus, p.date, { excludeEndDate: excludeEnd });
          return (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.node,
                { left: pos.x - NODE / 2, top: pos.y - NODE / 2 },
                picked.includes(p.id) && styles.nodeOn,
              ]}
              onPress={() => tap(p.id)}
            >
              <Text style={styles.nodeText}>{p.initials}</Text>
              <Text style={styles.nodeMeta}>{until}d</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>
        Spoke labels use the highlighted sets. Scroll the table for every pair.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={styles.tableRow}>
            {['Pair', 'Full dates', 'Days', 'Year ignored', 'From top date', 'Saved match'].map((h) => (
              <Text key={h} style={[styles.tableCell, styles.tableHead]}>
                {h}
              </Text>
            ))}
          </View>
          {spokePairs.map((row) => {
            const m = measures(row.a, row.b);
            const cells = [
              `${row.a.initials} · ${row.b.initials}`,
              m.span ? formatDmy(m.span) : '—',
              m.span ? String(m.span.totalDays) : '—',
              m.year == null ? '—' : `${m.year}d`,
              m.focusGap == null ? '—' : `${m.focusGap}d`,
              m.saved.length ? m.saved.map((s) => s.title || `${s.totalDays}d`).join(', ') : '—',
            ];
            return (
              <View key={`${row.a.id}-${row.b.id}`} style={styles.tableRow}>
                {cells.map((value, i) => (
                  <Text
                    key={`${row.a.id}-${i}`}
                    style={[styles.tableCell, i === 5 && m.saved.length ? { color: '#fbbf24' } : null]}
                  >
                    {value}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {pair ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>Pair</Text>
          <Text style={styles.pairTitle}>
            {pair.a.initials} → {pair.b.initials}
          </Text>
          <Text style={styles.ymd}>{formatDmy(pair.span)}</Text>
          <Text style={styles.meta}>
            {pair.a.initials} {formatDob(pair.a.date)} → {pair.b.initials} {formatDob(pair.b.date)}
          </Text>
          <Text style={styles.meta}>
            {formatUk(pair.span.from)} to {formatUk(pair.span.to)} · {pair.span.totalDays} days
            (full dates, years included)
          </Text>

          <Text style={[styles.kicker, { marginTop: 14 }]}>Days between</Text>
          <Text style={styles.meta}>From: {formatUk(pair.detail.from)}</Text>
          <Text style={styles.meta}>To: {formatUk(pair.detail.to)}</Text>
          <Text style={styles.bodyStrong}>{formatResultLine(pair.detail)}</Text>
          <Text style={styles.meta}>Or {formatCalendarLine(pair.detail)}</Text>
          <Text style={styles.meta}>Or {formatMonthLine(pair.detail)}</Text>
          <Text style={[styles.kicker, { marginTop: 10 }]}>Alternative time units</Text>
          <Text style={styles.meta}>• {pair.detail.totalDays.toLocaleString()} days</Text>
          <Text style={styles.meta}>• {formatWeekLine(pair.detail)}</Text>
          <Text style={styles.meta}>
            • {pair.detail.yearPct.toFixed(2)}% of a common year (365 days)
          </Text>
          <Text style={styles.meta}>
            • {(pair.detail.totalDays * 24).toLocaleString()} hours
          </Text>

          <Text style={[styles.kicker, { marginTop: 14 }]}>From the date at the top</Text>
          <Text style={styles.meta}>
            {pair.untilA}d until {pair.a.initials}'s next birthday
          </Text>
          <Text style={styles.meta}>
            {pair.untilB}d until {pair.b.initials}'s next birthday
          </Text>
          <Text style={styles.untilBig}>Difference {pair.birthdayGap}d</Text>
          <Text style={styles.hint}>
            |{pair.untilA} − {pair.untilB}|. Changes if you change the date at the top.
          </Text>

          <Text style={[styles.kicker, { marginTop: 10 }]}>Between the two birthdays (year ignored)</Text>
          <Text style={styles.untilBig}>{pair.anniversaryDays}d</Text>
          <Text style={styles.hint}>
            {formatDob(pair.a.date).slice(0, 5)} to {formatDob(pair.b.date).slice(0, 5)} each year. Does
            not use the date at the top.
          </Text>

          {wordMath ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.kicker}>Word to int</Text>
              <Text style={styles.meta}>
                {pair.a.initials} {pair.untilA}d ({wordMath.sumA.parts})=({wordMath.sumA.total}){' '}
                <Text style={styles.accent}>{hitsLabel(wordMath.hitsA)}</Text>
              </Text>
              <Text style={styles.meta}>
                {pair.b.initials} {pair.untilB}d ({wordMath.sumB.parts})=({wordMath.sumB.total}){' '}
                <Text style={styles.accent}>{hitsLabel(wordMath.hitsB)}</Text>
              </Text>
              <Text style={styles.meta}>
                ({wordMath.sumA.total})({wordMath.sumB.total}) = {wordMath.joined}{' '}
                <Text style={styles.accent}>{hitsLabel(wordMath.hitsJoined)}</Text>
              </Text>
              <Text style={styles.meta}>
                Difference {pair.birthdayGap} ={' '}
                <Text style={styles.accent}>{hitsLabel(wordMath.hitsGap)}</Text>
              </Text>
              <Text style={styles.meta}>
                {pair.anniversaryDays} (year ignored) ={' '}
                <Text style={styles.accent}>{hitsLabel(wordMath.hitsAnn)}</Text>
              </Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.button} onPress={savePair}>
            <Text style={styles.buttonText}>Save to birthday-gap list</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.hint}>Tap two dots. Long-press is not needed.</Text>
      )}

      <View style={styles.card}>
        <Text style={styles.subHead}>Add to timeline</Text>
        <Text style={styles.hint}>
          Category: wheel of dates. If you want a picture of the circle, take a screenshot on
          the phone, then pick it here as the extra image.
        </Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, useToday && styles.chipOn]}
            onPress={() => setUseToday(true)}
          >
            <Text style={[styles.chipText, useToday && styles.chipTextOn]}>Current date</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, !useToday && styles.chipOn]}
            onPress={() => setUseToday(false)}
          >
            <Text style={[styles.chipText, !useToday && styles.chipTextOn]}>Chosen date</Text>
          </TouchableOpacity>
        </View>
        {!useToday ? (
          <TextInput
            style={styles.input}
            value={eventDate}
            onChangeText={setEventDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
        ) : (
          <Text style={styles.hint}>Uses {formatUk(todayIso())}</Text>
        )}
        <TouchableOpacity style={styles.ghostBtn} onPress={pickExtraImage}>
          <Text style={styles.ghostText}>Add screenshot (optional)</Text>
        </TouchableOpacity>
        {eventImage ? <Image source={{ uri: eventImage }} style={styles.extraImg} /> : null}
        <TouchableOpacity style={styles.button} onPress={addWheelEvent} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Add wheel of dates event'}</Text>
        </TouchableOpacity>
        {events.map((ev) => (
          <Text key={ev.id} style={styles.meta}>
            {ev.title} · {formatUk(ev.date)}
          </Text>
        ))}
      </View>

      <Text style={styles.subHead}>DoB lines</Text>
      <Text style={styles.hint}>Every pair on the wheel. DD/MM/YYYY and result as YYy MMm DDd.</Text>
      {spokePairs.map((row) => (
        <View key={`${row.a.id}-${row.b.id}`} style={styles.listItem}>
          <Text style={styles.bodyStrong}>
            {row.a.initials} {formatDob(row.a.date)} → {row.b.initials} {formatDob(row.b.date)}
          </Text>
          <Text style={styles.accent}>{formatDmy(row.span)}</Text>
          <Text style={styles.hint}>
            {daysBetweenAnniversaries(row.a.date, row.b.date)}d between birthdays (year ignored)
          </Text>
        </View>
      ))}

      <Text style={styles.subHead}>People</Text>
      <Text style={styles.hint}>On the wheel for dates. Make hub to put someone in the middle.</Text>
      {people.map((p) => (
        <View key={p.id} style={styles.listItem}>
          <View style={styles.peopleRow}>
            <TouchableOpacity onPress={() => tap(p.id)} style={{ flex: 1 }}>
              <Text style={styles.bodyStrong}>{p.initials}</Text>
              <Text style={styles.meta}>{formatUk(p.date)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => setHub(p.id)}>
              <Text style={styles.chipText}>{p.role === 'hub' ? 'Hub' : 'Make hub'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

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

      <Text style={styles.subHead}>Birthday-gap list</Text>
      <Text style={styles.hint}>Own list, like Word to int. Not added to the Timeline.</Text>
      {savedPairs.length === 0 ? (
        <Text style={styles.hint}>Nothing saved yet.</Text>
      ) : (
        savedPairs.map((row) => (
          <View key={row.id} style={styles.listItem}>
            <Text style={styles.bodyStrong}>
              {row.aInitials} → {row.bInitials}
            </Text>
            <Text style={styles.accent}>{row.dmy || row.fullSpan}</Text>
            <Text style={styles.hint}>
              {row.birthdayGap}d between days-until · {row.untilA}d to {row.aInitials} · {row.untilB}d
              to {row.bInitials}
            </Text>
            <TouchableOpacity onPress={() => setSavedPairs((list) => list.filter((x) => x.id !== row.id))}>
              <Text style={styles.delete}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    backgroundColor: '#0f1024',
    flexGrow: 1,
    paddingBottom: 48,
    alignItems: 'stretch',
  },
  kicker: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  rowLinks: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  link: { color: '#93c5fd', fontSize: 15, fontWeight: '600' },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2f55',
    padding: 16,
    marginBottom: 16,
  },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#0f1024',
    borderColor: '#2e2f55',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6, lineHeight: 18 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  tableCell: { color: '#e2e8f0', width: 120, fontSize: 12, paddingVertical: 8, paddingHorizontal: 6 },
  tableHead: { color: '#93c5fd', fontWeight: '800', fontSize: 11 },
  toggle: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#3b82f6',
    marginTop: 2,
  },
  boxOn: { backgroundColor: '#3b82f6' },
  toggleText: { color: '#e2e8f0', fontSize: 15 },
  subHead: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 6,
  },
  untilBig: { color: '#f8fafc', fontSize: 20, fontWeight: '800', marginTop: 4 },
  untilSmall: { color: '#94a3b8', fontSize: 14, marginTop: 2 },
  wheel: { alignSelf: 'center', marginVertical: 12 },
  ring: { position: 'absolute', borderWidth: 1, borderColor: '#334155' },
  node: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 2,
    borderColor: '#475569',
    backgroundColor: '#1a1b36',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  hub: { backgroundColor: '#1e3a5f', zIndex: 3 },
  nodeOn: { borderColor: '#3b82f6', backgroundColor: '#3b82f6' },
  nodeText: { color: '#f8fafc', fontSize: 13, fontWeight: '800' },
  nodeMeta: { color: '#cbd5e1', fontSize: 10, marginTop: 2 },
  pairTitle: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  ymd: { color: '#93c5fd', fontSize: 28, fontWeight: '800', marginVertical: 6 },
  meta: { color: '#94a3b8', fontSize: 14, marginTop: 3, lineHeight: 20 },
  bodyStrong: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginTop: 4 },
  accent: { color: '#93c5fd', fontWeight: '700' },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  ghostText: { color: '#94a3b8', fontWeight: '600' },
  extraImg: { height: 120, borderRadius: 10, marginTop: 8 },
  listItem: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2f55',
    padding: 12,
    marginTop: 8,
  },
  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delete: { color: '#f87171', fontWeight: '600', marginTop: 6 },
});
