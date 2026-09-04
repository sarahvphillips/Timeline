import React, { useCallback, useRef, useState } from 'react';
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
  convertPhrase,
  formatBreakdown,
  getWordNumbers,
  saveWordNumber,
  deleteWordNumber,
  preferredNumber,
  findPhrasesForNumber,
  javaHashCode,
  METHODS,
} from '../services/wordToIntService';
import { getSpans, findSpansForNumber } from '../services/dateSpanService';
import { saveEvent } from '../services/eventService';

function isDayCount(n) {
  return Number.isInteger(n) && n >= 1 && n <= 200000;
}

function displayHash(item) {
  if (item?.hashCode != null && !Number.isNaN(Number(item.hashCode))) {
    return item.hashCode;
  }
  return javaHashCode(item?.phrase || '');
}

export default function WordToIntScreen({ navigation, route }) {
  const [phrase, setPhrase] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState('ordinal');
  const [list, setList] = useState([]);
  const [spans, setSpans] = useState([]);
  const [saving, setSaving] = useState(false);
  const [lookupNumber, setLookupNumber] = useState('');
  const lastPhraseParam = useRef(null);

  const result = convertPhrase(phrase);

  const loadList = useCallback(async () => {
    const [words, savedSpans] = await Promise.all([getWordNumbers(), getSpans()]);
    setList(words);
    setSpans(savedSpans);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadList();
      const incoming = route?.params?.phrase;
      const stamp = route?.params?.t || incoming;
      if (incoming && stamp !== lastPhraseParam.current) {
        lastPhraseParam.current = stamp;
        setPhrase(incoming);
        if (route.params?.preferred) setMethod(route.params.preferred);
        if (route.params?.notes) setNotes(route.params.notes);
      }
    }, [loadList, route?.params])
  );

  const currentNumber = () => {
    if (!result.phrase) return null;
    if (method === 'pythagorean') return result.pythagorean;
    if (method === 'reverse') return result.reverse;
    if (method === 'reduced') return result.reducedOrdinal.value;
    if (method === 'hashcode') return result.hashCode;
    return result.ordinal;
  };

  const copyText = async (text) => {
    if (Platform.OS === 'web' && navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(String(text));
        Alert.alert('Copied', String(text));
        return;
      } catch {
        /* fall through */
      }
    }
    Alert.alert('Number', String(text));
  };

  const handleSaveList = async () => {
    if (!result.phrase) {
      Alert.alert('Missing phrase', 'Type a word or short phrase first.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveWordNumber({
        phrase: result.phrase,
        notes,
        preferred: method,
      });
      await loadList();
      Alert.alert(
        saved.cloudSaved ? 'Saved on phone and Firebase' : 'Saved on this phone only',
        saved.cloudSaved
          ? `"${saved.phrase}" = ${preferredNumber(saved)} (${saved.preferred || method})`
          : `"${saved.phrase}" is on this device. Firebase: ${saved.cloudError || 'not signed in or Firestore is off'}.`
      );
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save this number.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTimeline = async () => {
    if (!result.phrase) {
      Alert.alert('Missing phrase', 'Type a word or short phrase first.');
      return;
    }
    const number = currentNumber();
    setSaving(true);
    try {
      const saved = await saveWordNumber({
        phrase: result.phrase,
        notes,
        preferred: method,
      });
      await saveEvent({
        title: `${result.phrase} = ${number}`,
        description: [
          `Phrase: ${result.phrase}`,
          `Method: ${METHODS.find((m) => m.id === method)?.label}`,
          `Ordinal: ${result.ordinal}`,
          `Pythagorean: ${result.pythagorean}`,
          `Reverse: ${result.reverse}`,
          `Reduced: ${result.reducedOrdinal.value}`,
          `Java hashCode: ${result.hashCode}`,
          notes ? `Notes: ${notes}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        date: new Date().toISOString(),
        category: 'hobby',
        source: 'word_to_int',
        labels: ['Word to Int'],
        nextAction: 'none',
        wordNumberId: saved.id,
        wordNumberValue: number,
      });
      await loadList();
      Alert.alert(
        saved.cloudSaved ? 'Saved on phone, timeline and Firebase' : 'Saved on this phone only',
        saved.cloudSaved
          ? `"${result.phrase}" is on the number list, timeline, and Firebase.`
          : `"${result.phrase}" is on this device. Firebase: ${saved.cloudError || 'not signed in or Firestore is off'}.`
      );
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not save to the timeline.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return Promise.resolve(window.confirm(message));
    }
    return new Promise((resolve) => {
      Alert.alert('Remove number', message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleDelete = async (item) => {
    const ok = await confirmDelete(`Remove "${item.phrase}" from the list?`);
    if (!ok) return;
    try {
      const next = await deleteWordNumber(item.id);
      setList(next);
    } catch {
      Alert.alert('Error', 'Could not delete this item.');
    }
  };

  const reuseItem = (item) => {
    setPhrase(item.phrase);
    setNotes(item.notes || '');
    setMethod(item.preferred || 'ordinal');
  };

  const handleUseAsDayCount = () => {
    const n = currentNumber();
    if (!isDayCount(n) || !navigation) return;
    navigation.navigate('DateSpan', {
      days: n,
      phrase: result.phrase,
      t: Date.now(),
    });
  };

  const openSpan = (span) => {
    if (!navigation) return;
    navigation.navigate('DateSpan', { span, t: Date.now() });
  };

  const matches = findPhrasesForNumber(list, lookupNumber);
  const spanMatches = findSpansForNumber(spans, lookupNumber);
  const number = currentNumber();
  const showDayCount = isDayCount(number);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Word to Int</Text>
      <Text style={styles.intro}>
        Turn a word or phrase into a number for poems, songs, and other timeline items.
        Letters only are counted for Ordinal / Pythagorean / Reverse / Reduced (spaces and punctuation are ignored).
        Java hashCode uses the full phrase, including spaces and punctuation.
        Save a phrase first, then type its number below to get the word back.
      </Text>

      <Text style={styles.sectionTitle}>Number to word</Text>
      <Text style={styles.label}>Number</Text>
      <TextInput
        style={styles.input}
        value={lookupNumber}
        onChangeText={setLookupNumber}
        placeholder="e.g. 64 or -123"
        placeholderTextColor="#64748b"
        keyboardType="numeric"
      />
      {!!String(lookupNumber).trim() && (
        <View style={styles.lookupCard}>
          {matches.length === 0 && spanMatches.length === 0 ? (
            <Text style={styles.empty}>
              No saved word or date span for {String(lookupNumber).trim()}. Convert the word and tap Save to number list first.
            </Text>
          ) : (
            <>
              {matches.map((item) => (
                <TouchableOpacity key={item.id} style={styles.lookupRow} onPress={() => reuseItem(item)}>
                  <Text style={styles.itemPhrase}>{item.phrase}</Text>
                  <Text style={styles.itemMeta}>
                    {preferredNumber(item)} · {item.preferred || 'ordinal'}
                    {item.notes ? ` · ${item.notes}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              {spanMatches.map((item) => (
                <TouchableOpacity key={`span-${item.id}`} style={styles.lookupRow} onPress={() => openSpan(item)}>
                  <Text style={styles.itemPhrase}>{item.title || `${item.totalDays} days`}</Text>
                  <Text style={styles.itemMeta}>
                    Span · {item.fromDate} → {item.toDate} · {item.totalDays} days
                    {item.note ? ` · ${item.note}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          {matches.length === 1 && spanMatches.length === 0 && (
            <TouchableOpacity style={styles.copyBtn} onPress={() => copyText(matches[0].phrase)}>
              <Text style={styles.copyText}>Copy word</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Word to number</Text>
      <Text style={styles.label}>Word or phrase</Text>
      <TextInput
        style={styles.input}
        value={phrase}
        onChangeText={setPhrase}
        placeholder="e.g. Figaro, North Star, rain"
        placeholderTextColor="#64748b"
        autoCapitalize="words"
      />

      <Text style={styles.label}>Method</Text>
      <View style={styles.methodRow}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.methodChip, method === m.id && styles.methodChipOn]}
            onPress={() => setMethod(m.id)}
          >
            <Text style={[styles.methodText, method === m.id && styles.methodTextOn]}>
              {m.short || m.id}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!result.phrase && (
        <View style={styles.resultCard}>
          <Text style={styles.resultNumber}>{currentNumber()}</Text>
          <Text style={styles.resultHint}>
            {METHODS.find((m) => m.id === method)?.label}
          </Text>
          {method === 'hashcode' ? (
            <Text style={styles.break}>
              Java String.hashCode of the full phrase (spaces and punctuation included).
            </Text>
          ) : (
            <Text style={styles.break}>
              {formatBreakdown(
                result,
                method === 'reverse' ? 'reverse' : method === 'pythagorean' ? 'pythagorean' : 'ordinal'
              )}
            </Text>
          )}
          <Text style={styles.meta}>
            Ordinal {result.ordinal} · Pythagorean {result.pythagorean} · Reverse {result.reverse} · Reduced {result.reducedOrdinal.value} · hashCode {result.hashCode} · Letters {result.letterCount}
          </Text>
          <TouchableOpacity style={styles.copyBtn} onPress={() => copyText(currentNumber())}>
            <Text style={styles.copyText}>Copy number</Text>
          </TouchableOpacity>
          {showDayCount && (
            <TouchableOpacity style={[styles.copyBtn, styles.ghostChip]} onPress={handleUseAsDayCount}>
              <Text style={styles.ghostChipText}>Use as day count</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Where this number is used (poem title, song, album…)"
        placeholderTextColor="#64748b"
        multiline
      />

      <TouchableOpacity style={styles.button} onPress={handleSaveList} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save to number list'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.ghost]} onPress={handleSaveTimeline} disabled={saving}>
        <Text style={styles.ghostText}>Save list + add to timeline</Text>
      </TouchableOpacity>

      <Text style={styles.listTitle}>Saved numbers</Text>
      {list.length === 0 ? (
        <Text style={styles.empty}>No saved numbers yet. Convert a phrase and save it here.</Text>
      ) : (
        list.map((item) => (
          <View key={item.id} style={styles.item}>
            <TouchableOpacity onPress={() => reuseItem(item)} style={styles.itemMain}>
              <Text style={styles.itemPhrase}>{item.phrase}</Text>
              <Text style={styles.itemNumber}>{preferredNumber(item)}</Text>
              <Text style={styles.itemMeta}>
                Ord {item.ordinal} · Pyth {item.pythagorean} · Rev {item.reverse} · Red {item.reduced} · hash {displayHash(item)}
              </Text>
              {!!item.notes && <Text style={styles.itemNotes}>{item.notes}</Text>}
            </TouchableOpacity>
            <View style={styles.itemActions}>
              <TouchableOpacity onPress={() => copyText(preferredNumber(item))}>
                <Text style={styles.link}>Copy</Text>
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
  sectionTitle: {
    color: '#c4b5fd',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 4,
  },
  lookupCard: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  lookupRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2f55',
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
    minHeight: 72,
    textAlignVertical: 'top',
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  methodChip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  methodChipOn: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  methodText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  methodTextOn: {
    color: '#fff',
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  resultNumber: {
    color: '#c4b5fd',
    fontSize: 48,
    fontWeight: '700',
  },
  resultHint: {
    color: '#94a3b8',
    marginBottom: 8,
  },
  break: {
    color: '#a5b4fc',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
  },
  copyBtn: {
    marginTop: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  copyText: {
    color: '#fff',
    fontWeight: '600',
  },
  ghostChip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#475569',
  },
  ghostChipText: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
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
