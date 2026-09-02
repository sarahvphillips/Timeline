import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  parseDateTime,
  formatLongDate,
  calculateSpan,
  formatResultLine,
  formatCalendarLine,
  formatMonthLine,
  formatWeekLine,
  dateFromDayCount,
  formatIsoDate,
  formatIsoTime,
  getSpans,
  saveSpan,
  deleteSpan,
} from '../services/dateSpanService';
import {
  getWordNumbers,
  findPhrasesForNumber,
  preferredNumber,
} from '../services/wordToIntService';
import { saveEvent } from '../services/eventService';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DateSpanScreen({ navigation, route }) {
  const [fromDate, setFromDate] = useState('1972-06-28');
  const [fromTime, setFromTime] = useState('00:00:00');
  const [toDate, setToDate] = useState(todayIso());
  const [toTime, setToTime] = useState('00:00:00');
  const [excludeEnd, setExcludeEnd] = useState(true);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [addDaysInput, setAddDaysInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [spans, setSpans] = useState([]);
  const [wordList, setWordList] = useState([]);
  const appliedParams = useRef(null);
  const skipAddDaysEffect = useRef(false);

  const from = parseDateTime(fromDate, fromTime);
  const to = parseDateTime(toDate, toTime);
  const span = useMemo(() => {
    if (!from || !to) return null;
    return calculateSpan(from, to, { excludeEndDate: excludeEnd });
  }, [fromDate, fromTime, toDate, toTime, excludeEnd, from, to]);

  const loadLists = useCallback(async () => {
    const [savedSpans, words] = await Promise.all([getSpans(), getWordNumbers()]);
    setSpans(savedSpans);
    setWordList(words);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLists();
    }, [loadLists])
  );

  useFocusEffect(
    useCallback(() => {
      const params = route?.params;
      if (!params) return;
      const stamp = params.t || JSON.stringify(params);
      if (appliedParams.current === stamp) return;
      appliedParams.current = stamp;

      if (params.span) {
        const s = params.span;
        skipAddDaysEffect.current = true;
        setFromDate(s.fromDate);
        setFromTime(s.fromTime || '00:00:00');
        setToDate(s.toDate);
        setToTime(s.toTime || '00:00:00');
        setExcludeEnd(s.excludeEnd !== false);
        setTitle(s.title || '');
        setNote(s.note || '');
        setAddDaysInput(s.totalDays != null ? String(s.totalDays) : '');
        return;
      }

      if (params.days != null && params.days !== '') {
        const n = Number(params.days);
        if (!Number.isNaN(n)) {
          skipAddDaysEffect.current = true;
          setFromDate((currentFrom) => {
            const fromStr = currentFrom || todayIso();
            const start =
              parseDateTime(fromStr, fromTime) ||
              parseDateTime(fromStr, '00:00:00') ||
              parseDateTime(todayIso(), '00:00:00');
            const end = dateFromDayCount(start, n, { excludeEndDate: excludeEnd });
            if (end) {
              setToDate(formatIsoDate(end));
              setToTime(formatIsoTime(end));
            }
            return fromStr;
          });
          setAddDaysInput(String(n));
          if (params.phrase) {
            const label = String(params.phrase);
            setTitle((t) => t || label);
            setNote((existing) => existing || `${label} → ${n} days`);
          }
        }
      }
    }, [route?.params, fromTime, excludeEnd])
  );

  useEffect(() => {
    if (skipAddDaysEffect.current) {
      skipAddDaysEffect.current = false;
      return;
    }
    const raw = String(addDaysInput).trim();
    if (!raw) return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    const start = parseDateTime(fromDate, fromTime);
    if (!start) return;
    const end = dateFromDayCount(start, n, { excludeEndDate: excludeEnd });
    if (!end) return;
    const nextDate = formatIsoDate(end);
    const nextTime = formatIsoTime(end);
    setToDate((d) => (d === nextDate ? d : nextDate));
    setToTime((t) => (t === nextTime ? t : nextTime));
  }, [addDaysInput, fromDate, fromTime, excludeEnd]);

  const copyText = async (text) => {
    if (Platform.OS === 'web' && navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        Alert.alert('Copied', 'Result copied.');
        return;
      } catch {
        /* fall through */
      }
    }
    Alert.alert('Result', text);
  };

  const resultText = span
    ? [
        `From: ${formatLongDate(span.from)}`,
        `To: ${formatLongDate(span.to)}`,
        '',
        `Result: ${formatResultLine(span)}`,
        `Or ${formatCalendarLine(span)}`,
        `Or ${formatMonthLine(span)}`,
        '',
        'Alternative time units',
        `${span.totalSeconds.toLocaleString()} seconds`,
        `${span.totalMinutes.toLocaleString()} minutes`,
        `${span.totalHours.toLocaleString()} hours`,
        `${span.totalDays.toLocaleString()} days`,
        formatWeekLine(span),
        `${span.yearPct.toFixed(2)}% of a common year (365 days)`,
      ].join('\n')
    : '';

  const handleSaveTimeline = async () => {
    if (!span) {
      Alert.alert('Check dates', 'Use YYYY-MM-DD and HH:MM:SS.');
      return;
    }
    const eventTitle = title.trim() || `${span.totalDays} days`;
    const description = [note.trim(), resultText].filter(Boolean).join('\n\n');
    setSaving(true);
    try {
      await saveEvent({
        title: eventTitle,
        description,
        date: span.to.toISOString(),
        category: 'days_between',
        source: 'date_span',
        labels: ['Days Between'],
        personalNote: note.trim() || undefined,
        nextAction: 'none',
      });
      Alert.alert('Saved', 'Added to your timeline under Days Between.');
    } catch {
      Alert.alert('Error', 'Could not save to the timeline.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveList = async () => {
    if (!span) {
      Alert.alert('Check dates', 'Use YYYY-MM-DD and HH:MM:SS.');
      return;
    }
    setSaving(true);
    try {
      await saveSpan({
        fromDate,
        fromTime,
        toDate,
        toTime,
        excludeEnd,
        title,
        note,
        totalDays: span.totalDays,
        calendarLine: formatCalendarLine(span),
      });
      await loadLists();
      Alert.alert('Saved', 'Added to your span list.');
    } catch {
      Alert.alert('Error', 'Could not save this span.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return Promise.resolve(window.confirm(message));
    }
    return new Promise((resolve) => {
      Alert.alert('Remove span', message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleDelete = async (item) => {
    const label = item.title || `${item.fromDate} → ${item.toDate}`;
    const ok = await confirmDelete(`Remove "${label}" from the list?`);
    if (!ok) return;
    try {
      const next = await deleteSpan(item.id);
      setSpans(next);
    } catch {
      Alert.alert('Error', 'Could not delete this span.');
    }
  };

  const reuseSpan = (item) => {
    skipAddDaysEffect.current = true;
    setFromDate(item.fromDate);
    setFromTime(item.fromTime || '00:00:00');
    setToDate(item.toDate);
    setToTime(item.toTime || '00:00:00');
    setExcludeEnd(item.excludeEnd !== false);
    setTitle(item.title || '');
    setNote(item.note || '');
    setAddDaysInput(item.totalDays != null ? String(item.totalDays) : '');
  };

  const openPhrase = (item) => {
    if (!navigation) return;
    navigation.navigate('WordToInt', {
      phrase: item.phrase,
      preferred: item.preferred,
      t: Date.now(),
    });
  };

  const phraseMatches = span ? findPhrasesForNumber(wordList, span.totalDays) : [];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Days between dates</Text>
      <Text style={styles.intro}>
        Same style of breakdown as timeanddate: total days and time, then years / months / days,
        then other units. Default ignores the end date. Saved events use the Days Between category.
      </Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. From birth to that November"
        placeholderTextColor="#64748b"
      />
      <Text style={styles.label}>Personal note</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        value={note}
        onChangeText={setNote}
        placeholder="Why this span matters to you"
        placeholderTextColor="#64748b"
        multiline
      />

      <Text style={styles.label}>From date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={fromDate}
        onChangeText={setFromDate}
        placeholder="1972-06-28"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
      />
      <Text style={styles.label}>From time (HH:MM:SS)</Text>
      <TextInput
        style={styles.input}
        value={fromTime}
        onChangeText={setFromTime}
        placeholder="00:00:00"
        placeholderTextColor="#64748b"
      />

      <Text style={styles.label}>To date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={toDate}
        onChangeText={setToDate}
        placeholder="1986-11-14"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
      />
      <Text style={styles.label}>To time (HH:MM:SS)</Text>
      <TextInput
        style={styles.input}
        value={toTime}
        onChangeText={setToTime}
        placeholder="00:00:00"
        placeholderTextColor="#64748b"
      />

      <TouchableOpacity style={styles.toggle} onPress={() => setExcludeEnd((v) => !v)}>
        <View style={[styles.box, excludeEnd && styles.boxOn]} />
        <Text style={styles.toggleText}>Exclude the end date</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Add N days (sets To from From)</Text>
      <TextInput
        style={styles.input}
        value={addDaysInput}
        onChangeText={setAddDaysInput}
        placeholder="e.g. 64"
        placeholderTextColor="#64748b"
        keyboardType="number-pad"
      />

      {!from || !to ? (
        <Text style={styles.error}>Enter valid dates as YYYY-MM-DD and times as HH:MM:SS.</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.meta}>From: {formatLongDate(span.from)}</Text>
          <Text style={styles.meta}>To: {formatLongDate(span.to)}</Text>
          {span.swapped && (
            <Text style={styles.note}>Dates were swapped so the earlier date is From.</Text>
          )}

          <Text style={styles.resultLabel}>Result</Text>
          <Text style={styles.result}>{formatResultLine(span)}</Text>
          <Text style={styles.or}>Or {formatCalendarLine(span)}</Text>
          <Text style={styles.or}>Or {formatMonthLine(span)}</Text>

          <Text style={styles.altTitle}>Alternative time units</Text>
          <Text style={styles.alt}>• {span.totalSeconds.toLocaleString()} seconds</Text>
          <Text style={styles.alt}>• {span.totalMinutes.toLocaleString()} minutes</Text>
          <Text style={styles.alt}>• {span.totalHours.toLocaleString()} hours</Text>
          <Text style={styles.alt}>• {span.totalDays.toLocaleString()} days</Text>
          <Text style={styles.alt}>• {formatWeekLine(span)}</Text>
          <Text style={styles.alt}>• {span.yearPct.toFixed(2)}% of a common year (365 days)</Text>

          {phraseMatches.length > 0 && (
            <View style={styles.matchBlock}>
              <Text style={styles.altTitle}>Matching Word to Int phrases</Text>
              {phraseMatches.map((item) => (
                <TouchableOpacity key={item.id} style={styles.lookupRow} onPress={() => openPhrase(item)}>
                  <Text style={styles.itemPhrase}>{item.phrase}</Text>
                  <Text style={styles.itemMeta}>
                    {preferredNumber(item)} · {item.preferred || 'ordinal'}
                    {item.notes ? ` · ${item.notes}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.button} onPress={() => copyText(resultText)}>
            <Text style={styles.buttonText}>Copy result</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleSaveList} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save to span list'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.ghost]} onPress={handleSaveTimeline} disabled={saving}>
            <Text style={styles.ghostText}>{saving ? 'Saving…' : 'Save to timeline'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.listTitle}>Saved spans</Text>
      {spans.length === 0 ? (
        <Text style={styles.empty}>No saved spans yet. Set the dates and tap Save to span list.</Text>
      ) : (
        spans.map((item) => (
          <View key={item.id} style={styles.item}>
            <TouchableOpacity onPress={() => reuseSpan(item)} style={styles.itemMain}>
              <Text style={styles.itemPhrase}>{item.title || `${item.totalDays} days`}</Text>
              <Text style={styles.itemNumber}>{item.totalDays} days</Text>
              <Text style={styles.itemMeta}>
                {item.fromDate} {item.fromTime || '00:00:00'} → {item.toDate} {item.toTime || '00:00:00'}
              </Text>
              {!!item.calendarLine && <Text style={styles.itemMeta}>{item.calendarLine}</Text>}
              {!!item.note && <Text style={styles.itemNotes}>{item.note}</Text>}
            </TouchableOpacity>
            <View style={styles.itemActions}>
              <TouchableOpacity onPress={() => reuseSpan(item)}>
                <Text style={styles.link}>Reuse</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={styles.delete}>Delete</Text>
              </TouchableOpacity>
            </View>
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
  },
  heading: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  intro: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    color: '#a5b4fc',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
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
  notes: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#3b82f6',
    marginRight: 10,
  },
  boxOn: {
    backgroundColor: '#3b82f6',
  },
  toggleText: {
    color: '#e2e8f0',
    fontSize: 15,
  },
  error: {
    color: '#f87171',
    marginTop: 12,
  },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  meta: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 4,
  },
  note: {
    color: '#fbbf24',
    fontSize: 13,
    marginTop: 4,
  },
  resultLabel: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 4,
  },
  result: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  or: {
    color: '#cbd5e1',
    fontSize: 15,
    marginTop: 8,
    lineHeight: 22,
  },
  altTitle: {
    color: '#c4b5fd',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 8,
  },
  alt: {
    color: '#e2e8f0',
    fontSize: 15,
    marginBottom: 4,
  },
  matchBlock: {
    marginTop: 4,
  },
  lookupRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2f55',
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#475569',
  },
  ghostText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 16,
  },
  listTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 28,
    marginBottom: 10,
  },
  empty: {
    color: '#94a3b8',
  },
  item: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemMain: {
    marginBottom: 8,
  },
  itemPhrase: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  itemNumber: {
    color: '#c4b5fd',
    fontSize: 28,
    fontWeight: '700',
    marginVertical: 4,
  },
  itemMeta: {
    color: '#64748b',
    fontSize: 12,
  },
  itemNotes: {
    color: '#94a3b8',
    marginTop: 6,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  link: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  delete: {
    color: '#f87171',
    fontWeight: '600',
  },
});
