import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import { useTheme } from '../themeContext';
import { getEvents } from '../services/eventService';
import { getWordNumbers, preferredNumber } from '../services/wordToIntService';

const MOTIF = 'norse';

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

function matchKind(event) {
  const labels = Array.isArray(event?.labels) ? event.labels : [];
  if (labels.some((label) => mentionsMotif(label, MOTIF))) return 'Label';
  if (
    mentionsMotif(event?.description, MOTIF) ||
    mentionsMotif(event?.notes, MOTIF) ||
    mentionsMotif(event?.singingLyrics, MOTIF) ||
    mentionsMotif(event?.singingFelt, MOTIF) ||
    mentionsMotif(event?.audioNote, MOTIF)
  ) {
    return 'Note';
  }
  if (mentionsMotif(event?.title, MOTIF) || mentionsMotif(event?.collectionName, MOTIF)) return 'Title';
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

export default function MotifsScreen({ navigation }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState([]);
  const [writing, setWriting] = useState([]);
  const [words, setWords] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [events, numbers] = await Promise.all([
        getEvents().catch(() => []),
        getWordNumbers().catch(() => []),
      ]);
      const hits = (events || []).filter((event) => eventTexts(event).some((text) => mentionsMotif(text, MOTIF)));
      const poems = [];
      const rest = [];
      hits.forEach((event) => {
        if (isWriting(event)) poems.push(event);
        else rest.push(event);
      });
      const byDate = (a, b) => String(b?.date || '').localeCompare(String(a?.date || ''));
      setTimeline(rest.sort(byDate));
      setWriting(poems.sort(byDate));
      setWords(
        (numbers || []).filter((item) => mentionsMotif(item?.notes, MOTIF))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = timeline.length + writing.length + words.length;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.blueSoft }]}>Motifs</Text>
        <Text style={[styles.title, { color: colors.text }]}>Norse</Text>
        <Text style={[styles.intro, { color: colors.faint }]}>
          {loading ? 'Looking through notes and labels…' : `${total} item${total === 1 ? '' : 's'} · from labels and notes`}
        </Text>
        <Text style={[styles.rule, { color: colors.faint, borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
          A word such as Frigg is included only when its note says Norse or #norse. The word itself is not enough.
        </Text>

        {loading ? <ActivityIndicator color={colors.blueSoft} style={{ marginTop: 24 }} /> : null}

        <Section
          title="On the timeline"
          colors={colors}
          empty="No timeline events noted as Norse yet."
          rows={timeline.map((event) => ({
            key: event.id,
            kicker: dateLabel(event.date) || 'Timeline',
            title: event.title || 'Untitled',
            detail: event.description || '',
            chip: matchKind(event),
            onPress: () => openEvent(navigation, event),
          }))}
        />
        <Section
          title="Words and numbers"
          colors={colors}
          empty="No saved words with Norse in the note yet."
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
          empty="No poems or recordings noted as Norse yet."
          rows={writing.map((event) => ({
            key: event.id,
            kicker: event.hobbyType === 'singing' || event.hobbyType === 'music' ? 'Sound' : 'Poem',
            title: event.title || 'Untitled',
            detail: event.description || event.singingFelt || '',
            chip: matchKind(event),
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
            <Text style={[styles.chip, { backgroundColor: colors.blue, color: colors.bg }]}>{row.chip}</Text>
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
  intro: { fontSize: 14, marginTop: 6 },
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
