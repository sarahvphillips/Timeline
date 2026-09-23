import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import { useTheme } from '../themeContext';
import { getEvents } from '../services/eventService';
import { getWordNumbers, preferredNumber } from '../services/wordToIntService';

const KNOWN = ['norse', 'binary'];

function hashTags(text) {
  const found = [];
  const re = /#([a-z0-9_]+)/gi;
  let match = re.exec(String(text || ''));
  while (match) {
    const tag = match[1].toLowerCase();
    if (!found.includes(tag)) found.push(tag);
    match = re.exec(String(text || ''));
  }
  return found;
}

function mentionsMotif(text, motif) {
  const word = String(motif || '').replace(/^#/, '').trim();
  if (!word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])#?${escaped}([^a-z0-9]|$)`, 'i').test(String(text || ''));
}

function isWriting(event) {
  return (
    event?.source === 'poem' ||
    event?.hobbyType === 'poetry' ||
    event?.hobbyType === 'singing' ||
    event?.hobbyType === 'music'
  );
}

function eventTexts(event) {
  const labels = Array.isArray(event?.labels) ? event.labels : [];
  return [
    event?.title,
    event?.description,
    event?.notes,
    event?.singingLyrics,
    event?.singingFelt,
    event?.audioNote,
    event?.collectionName,
    ...labels,
  ];
}

function matchKind(event, motif) {
  const labels = Array.isArray(event?.labels) ? event.labels : [];
  if (labels.some((label) => mentionsMotif(label, motif))) return 'Label';
  if (
    mentionsMotif(event?.description, motif) ||
    mentionsMotif(event?.notes, motif) ||
    mentionsMotif(event?.singingLyrics, motif) ||
    mentionsMotif(event?.singingFelt, motif) ||
    mentionsMotif(event?.audioNote, motif)
  ) {
    return 'Note';
  }
  if (mentionsMotif(event?.title, motif) || mentionsMotif(event?.collectionName, motif)) return 'Title';
  return 'Note';
}

function dateLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function openEvent(navigation, event) {
  if (!event) return;
  if (event.hobbyType === 'poetry' || event.source === 'poem') {
    navigation.navigate('AddPoem', { event });
    return;
  }
  if (event.hobbyType === 'singing' || event.hobbyType === 'music') {
    navigation.navigate('AddSinging', { event });
    return;
  }
  navigation.navigate('AddEvent', { event });
}

function labelFor(tag) {
  const word = String(tag || '');
  if (!word) return 'Motif';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default function MotifsScreen({ navigation }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [motif, setMotif] = useState('norse');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventRows, numberRows] = await Promise.all([
        getEvents().catch(() => []),
        getWordNumbers().catch(() => []),
      ]);
      setEvents(eventRows || []);
      setNumbers(numberRows || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const tags = useMemo(() => {
    const found = new Set(KNOWN);
    (events || []).forEach((event) => {
      eventTexts(event).forEach((text) => hashTags(text).forEach((tag) => found.add(tag)));
    });
    (numbers || []).forEach((item) => hashTags(item?.notes).forEach((tag) => found.add(tag)));
    return [...found].sort((a, b) => {
      const ai = KNOWN.indexOf(a);
      const bi = KNOWN.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
  }, [events, numbers]);

  const timeline = useMemo(() => {
    return (events || [])
      .filter((event) => !isWriting(event) && eventTexts(event).some((text) => mentionsMotif(text, motif)))
      .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
  }, [events, motif]);

  const writing = useMemo(() => {
    return (events || [])
      .filter((event) => isWriting(event) && eventTexts(event).some((text) => mentionsMotif(text, motif)))
      .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
  }, [events, motif]);

  const words = useMemo(() => {
    return (numbers || []).filter((item) => mentionsMotif(item?.notes, motif));
  }, [numbers, motif]);

  const total = timeline.length + writing.length + words.length;
  const shown = `#${motif}`;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.blueSoft }]}>Motifs</Text>
        <Text style={[styles.title, { color: colors.text }]}>{labelFor(motif)}</Text>
        <View style={styles.row}>
          {tags.map((tag) => {
            const on = tag === motif;
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.tag, { borderColor: colors.cardBorder, backgroundColor: colors.card }, on && { backgroundColor: colors.blue, borderColor: colors.blue }]}
                onPress={() => setMotif(tag)}
              >
                <Text style={[styles.tagText, { color: colors.text }, on && { color: '#fff' }]}>{`#${tag}`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.intro, { color: colors.faint }]}>
          {loading ? 'Looking through notes and labels…' : `${total} item${total === 1 ? '' : 's'} noted as ${shown}`}
        </Text>
        <Text style={[styles.rule, { color: colors.faint, borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
          {`A saved word is included only when its note says ${shown}. The word itself is not enough.`}
        </Text>

        {loading ? <ActivityIndicator color={colors.blueSoft} style={{ marginTop: 24 }} /> : null}

        <Section
          title="On the timeline"
          colors={colors}
          empty={`No timeline events noted as ${shown} yet.`}
          rows={timeline.map((event) => ({
            key: event.id,
            kicker: dateLabel(event.date) || 'Timeline',
            title: event.title || 'Untitled',
            detail: event.description || '',
            chip: matchKind(event, motif),
            onPress: () => openEvent(navigation, event),
          }))}
        />
        <Section
          title="Words and numbers"
          colors={colors}
          empty={`No saved words with ${shown} in the note yet.`}
          rows={words.map((item) => ({
            key: item.id,
            kicker: 'Word to int',
            title: item.phrase,
            extra: String(preferredNumber(item) ?? ''),
            detail: item.notes || '',
            chip: 'Note',
            onPress: () =>
              navigation.navigate('WordToInt', {
                phrase: item.phrase,
                notes: item.notes || '',
                preferred: item.preferred || 'ordinal',
                t: Date.now(),
              }),
          }))}
        />
        <Section
          title="Writing and sound"
          colors={colors}
          empty={`No poems or recordings noted as ${shown} yet.`}
          rows={writing.map((event) => ({
            key: event.id,
            kicker: event.hobbyType === 'singing' || event.hobbyType === 'music' ? 'Sound' : 'Poem',
            title: event.title || 'Untitled',
            detail: event.description || event.singingFelt || '',
            chip: matchKind(event, motif),
            onPress: () => openEvent(navigation, event),
          }))}
        />
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

function Section({ title, rows, empty, colors }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.blueSoft }]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.faint }]}>{empty}</Text>
      ) : (
        rows.map((row) => (
          <TouchableOpacity
            key={row.key}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={row.onPress}
          >
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kickerSmall, { color: colors.faint }]}>{row.kicker}</Text>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{row.title}</Text>
              </View>
              {row.extra ? <Text style={[styles.extra, { color: colors.blueSoft }]}>{row.extra}</Text> : null}
            </View>
            {row.detail ? (
              <Text style={[styles.detail, { color: colors.faint }]} numberOfLines={3}>
                {row.detail}
              </Text>
            ) : null}
            <Text style={[styles.chip, { backgroundColor: colors.blue, color: '#fff' }]}>{row.chip}</Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20, paddingBottom: 120 },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 32, fontWeight: '800', marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tagText: { fontWeight: '800', fontSize: 14 },
  intro: { fontSize: 14, marginTop: 10 },
  rule: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  empty: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  card: { marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kickerSmall: { fontSize: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  extra: { fontSize: 18, fontWeight: '700' },
  detail: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  chip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
  },
});
