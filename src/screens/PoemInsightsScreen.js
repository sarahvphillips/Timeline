import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../themeContext';
import HomeFab from '../components/HomeFab';
import { getEvents } from '../services/eventService';
import { getWordNumbers } from '../services/wordToIntService';
import {
  analysePoems,
  POEM_INSIGHTS_COST,
  POEM_INSIGHTS_PERK,
} from '../services/poemAnalysis';
import {
  CREDITS_PAUSED,
  getRewards,
  hasPerk,
  spendShopItem,
} from '../services/rewardsService';
import { formatFullDate } from '../services/dateFormat';

export default function PoemInsightsScreen({ navigation }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [unlocked, setUnlocked] = useState(CREDITS_PAUSED);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [events, words, rewards] = await Promise.all([
        getEvents(),
        getWordNumbers().catch(() => []),
        getRewards().catch(() => null),
      ]);
      setReport(analysePoems(events, words));
      setUnlocked(CREDITS_PAUSED || hasPerk(rewards, POEM_INSIGHTS_PERK));
    } catch {
      setReport(analysePoems([], []));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await spendShopItem(POEM_INSIGHTS_PERK);
      setUnlocked(true);
    } catch (e) {
      if (e?.code === 'OWNED') setUnlocked(true);
      else if (e?.code === 'NEED_CREDITS') {
        Alert.alert('Need credits', `Poem patterns costs ${POEM_INSIGHTS_COST} credits.`);
      } else {
        Alert.alert('Could not unlock', e?.message || 'Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.kicker, { color: colors.blueSoft }]}>Credits</Text>
          <Text style={[styles.heading, { color: colors.text }]}>Poem patterns</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Counts words, lines and title numbers across your poem events. Not everyone writes poems,
            so this stays a credit perk.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.blue }]}
            onPress={unlock}
            disabled={busy}
          >
            <Text style={styles.btnText}>
              {busy ? 'Unlocking…' : `Unlock · ${POEM_INSIGHTS_COST} credits`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <HomeFab navigation={navigation} />
      </View>
    );
  }

  const t = report?.totals || { poems: 0, words: 0, lines: 0, chars: 0, uniqueWords: 0, avgWords: 0, avgLines: 0 };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.blueSoft }]}>Utilities</Text>
        <Text style={[styles.heading, { color: colors.text }]}>Poem patterns</Text>
        {CREDITS_PAUSED ? (
          <Text style={[styles.note, { color: colors.faint, borderColor: colors.cardBorder }]}>
            Free during this test. Later this costs {POEM_INSIGHTS_COST} credits once.
          </Text>
        ) : null}
        <Text style={[styles.body, { color: colors.muted }]}>
          Uses titles, poem text, dates, albums and labels already on your poem events. Word to int
          numbers for titles are included when they match a saved word.
        </Text>

        <View style={styles.stats}>
          {[
            [t.poems, 'poems'],
            [t.words, 'words'],
            [t.lines, 'lines'],
            [t.uniqueWords, 'unique'],
            [t.avgWords, 'avg words'],
            [t.avgLines, 'avg lines'],
          ].map((row) => (
            <View key={row[1]} style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.statNum, { color: colors.blueSoft }]}>{row[0]}</Text>
              <Text style={[styles.statLbl, { color: colors.faint }]}>{row[1]}</Text>
            </View>
          ))}
        </View>

        {!t.poems ? (
          <Text style={[styles.body, { color: colors.muted }]}>
            No poem events yet. Add a poem, then come back.
          </Text>
        ) : (
          <>
            {report.first && report.last ? (
              <Text style={[styles.body, { color: colors.muted }]}>
                First dated {formatFullDate(report.first.date)} · latest {formatFullDate(report.last.date)}.
              </Text>
            ) : null}
            {report.longest ? (
              <Text style={[styles.body, { color: colors.muted }]}>
                Longest: {report.longest.title} ({report.longest.wordCount} words, {report.longest.lineCount} lines).
              </Text>
            ) : null}
            {report.shortest && report.shortest.id !== report.longest?.id ? (
              <Text style={[styles.body, { color: colors.muted }]}>
                Shortest: {report.shortest.title} ({report.shortest.wordCount} words).
              </Text>
            ) : null}

            <Text style={[styles.h, { color: colors.text }]}>Words used most</Text>
            {report.wordFreq.slice(0, 20).map(([word, count]) => (
              <View key={word} style={styles.freqRow}>
                <Text style={[styles.freqWord, { color: colors.text }]}>{word}</Text>
                <Text style={[styles.freqCount, { color: colors.blueSoft }]}>{count}</Text>
              </View>
            ))}

            <Text style={[styles.h, { color: colors.text }]}>Title numbers</Text>
            <Text style={[styles.body, { color: colors.faint }]}>
              Ordinal letter-sum of each title. Shared numbers mean two titles land on the same count.
            </Text>
            {report.sharedOrdinals.length ? (
              report.sharedOrdinals.map((row) => (
                <Text key={row.number} style={[styles.body, { color: colors.muted }]}>
                  {row.number}: {row.poems.map((p) => p.title).join(' · ')}
                </Text>
              ))
            ) : (
              <Text style={[styles.body, { color: colors.muted }]}>No two titles share an ordinal yet.</Text>
            )}

            {report.poems.some((p) => p.savedWord) ? (
              <>
                <Text style={[styles.h, { color: colors.text }]}>Titles already in Word to int</Text>
                {report.poems
                  .filter((p) => p.savedWord)
                  .map((p) => (
                    <Text key={p.id} style={[styles.body, { color: colors.muted }]}>
                      {p.title} · {p.savedNumber}
                    </Text>
                  ))}
              </>
            ) : null}

            {report.collections.length ? (
              <>
                <Text style={[styles.h, { color: colors.text }]}>Albums / books</Text>
                {report.collections.map(([name, count]) => (
                  <Text key={name} style={[styles.body, { color: colors.muted }]}>
                    {name} · {count}
                  </Text>
                ))}
              </>
            ) : null}

            <Text style={[styles.h, { color: colors.text }]}>Each poem</Text>
            {report.poems.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                onPress={() => navigation.navigate('EventView', { event: p.event })}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>{p.title}</Text>
                <Text style={[styles.cardMeta, { color: colors.faint }]}>
                  {formatFullDate(p.date)} · {p.wordCount} words · {p.lineCount} lines · {p.charCount} letters
                  {p.avgLineWords ? ` · ${p.avgLineWords} words/line` : ''}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.blueSoft }]}>
                  Title Ord {p.titleOrdinal} · Pyth {p.titlePyth} · Rev {p.titleReverse} · Red {p.titleReduced}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.blue }]}
              onPress={() => navigation.navigate('PoemGraph')}
            >
              <Text style={styles.btnText}>Open poem graph</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <HomeFab navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 88 },
  kicker: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  heading: { fontSize: 26, fontWeight: '800', marginTop: 4, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  note: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, lineHeight: 18 },
  h: { fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  stat: { width: '30%', minWidth: 96, borderWidth: 1, borderRadius: 12, padding: 10 },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLbl: { fontSize: 12, marginTop: 2 },
  freqRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  freqWord: { fontSize: 15, fontWeight: '600' },
  freqCount: { fontSize: 15, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardMeta: { fontSize: 13, marginTop: 4 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  canvas: { borderWidth: 1, borderRadius: 16, marginTop: 12, overflow: 'hidden' },
});
