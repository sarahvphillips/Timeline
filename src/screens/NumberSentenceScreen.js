import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useTheme } from '../themeContext';
import {
  convertPhrase,
  findPhrasesForNumber,
  findSavedPhrase,
  getWordNumbers,
  saveWordNumber,
  addWordSearch,
  addNumberSearch,
  LOOKUP_METHODS,
} from '../services/wordToIntService';

const METHODS = (Array.isArray(LOOKUP_METHODS) ? LOOKUP_METHODS : []).filter((m) => m.id !== 'hashcode');

function numberForPhrase(phrase, method) {
  const result = convertPhrase(phrase);
  if (method === 'pythagorean') return result.pythagorean;
  if (method === 'reverse') return result.reverse;
  if (method === 'reduced') return result.reducedOrdinal.value;
  if (method === 'hashcode') return result.hashCode;
  return result.ordinal;
}

function storedNumber(entry, method) {
  if (!entry) return null;
  if (method === 'pythagorean') return entry.pythagorean;
  if (method === 'reverse') return entry.reverse;
  if (method === 'reduced') return entry.reduced;
  if (method === 'hashcode') return entry.hashCode;
  return entry.ordinal;
}

function lookupPhrase(raw) {
  return String(raw || '').replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
}

function isNumberToken(raw) {
  return /^-?\d+$/.test(String(raw || '').trim());
}

export default function NumberSentenceScreen() {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('numbers');
  const [draft, setDraft] = useState('47 said 52');
  const [method, setMethod] = useState('ordinal');
  const [lines, setLines] = useState([]);
  const [locks, setLocks] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setLines([]);
    setNotice('');
    setLocks({});
    if (next === 'words' && draft.trim() === '47 said 52') setDraft('Frigg said the word');
    if (next === 'numbers' && draft.trim() === 'Frigg said the word') setDraft('47 said 52');
  };

  const show = async () => {
    const text = String(draft || '').trim();
    if (!text) {
      Alert.alert('Sentence', 'Type numbers, words, or both.');
      return;
    }
    setBusy(true);
    try {
      const list = await getWordNumbers();
      const added = [];
      const nextLines = text.split('\n').map((line, li) => {
        const tokens = line.trim() ? line.trim().split(/\s+/) : [];
        return tokens.map((raw, ti) => {
          const key = `${li}-${ti}-${raw}`;
          if (mode === 'words') {
            if (isNumberToken(raw)) {
              return { key, raw, kind: 'literal', phrase: raw, number: raw, searching: false };
            }
            const lookup = lookupPhrase(raw);
            if (!lookup) {
              return { key, raw, kind: 'mark', phrase: raw, number: '', searching: false };
            }
            const saved = findSavedPhrase(list, lookup);
            const calculated = String(numberForPhrase(lookup, method));
            const fromStore = saved ? storedNumber(saved, method) : null;
            return {
              key,
              raw,
              kind: 'word',
              hits: [],
              lookup,
              phrase: raw,
              number: fromStore == null || fromStore === '' ? calculated : String(fromStore),
              searching: !saved,
              offerSave: !saved,
            };
          }
          if (isNumberToken(raw)) {
            const hits = findPhrasesForNumber(list, raw, method);
            return { key, raw, kind: 'number', hits, searching: hits.length === 0 };
          }
          const saved = findSavedPhrase(list, raw);
          return {
            key,
            raw,
            kind: 'word',
            hits: [],
            searching: !saved,
            phrase: raw,
            number: String(numberForPhrase(raw, method)),
          };
        });
      });

      if (mode === 'numbers') {
        for (const line of nextLines) {
          for (const token of line) {
            if (token.kind === 'word' && token.searching) {
              const result = await addWordSearch(token.raw, 'From number sentence');
              if (!result.already) added.push(token.raw);
            }
            if (token.kind === 'number' && token.searching) {
              const result = await addNumberSearch(token.raw, method, 'From number sentence');
              if (!result.already) added.push(token.raw);
            }
          }
        }
      }

      setLines(nextLines);
      setNotice(
        mode === 'words'
          ? 'Blue numbers are already saved. Red numbers are calculated only — save or leave each one.'
          : added.length
            ? `Added to Searching for: ${added.join(', ')}`
            : 'Nothing new for Searching for.'
      );
    } catch (e) {
      Alert.alert('Could not build that', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const chosenPhrase = (token) => {
    if (token.kind === 'word') return token.phrase;
    const locked = locks[token.key];
    if (locked && token.hits.some((hit) => hit.phrase === locked)) return locked;
    if (token.hits.length === 1) return token.hits[0].phrase;
    return '';
  };

  const markToken = (key, patch) => {
    setLines((cur) => cur.map((line) => line.map((token) => (token.key === key ? { ...token, ...patch } : token))));
  };

  const storeWord = async (token) => {
    const phrase = token.lookup || token.phrase;
    if (!phrase) return;
    try {
      await saveWordNumber({ phrase, preferred: method, notes: 'From number sentence' });
      markToken(token.key, { searching: false, offerSave: false, saved: true });
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.page}>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.cardBorder }, mode === 'numbers' && { backgroundColor: colors.blue, borderColor: colors.blue }]}
          onPress={() => switchMode('numbers')}
        >
          <Text style={{ color: mode === 'numbers' ? '#fff' : colors.faint, fontSize: 13 }}>Numbers to words</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.cardBorder }, mode === 'words' && { backgroundColor: colors.blue, borderColor: colors.blue }]}
          onPress={() => switchMode('words')}
        >
          <Text style={{ color: mode === 'words' ? '#fff' : colors.faint, fontSize: 13 }}>Words to numbers</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.intro, { color: colors.faint }]}>
        {mode === 'words'
          ? 'Write a sentence. Saved words use their stored number, in blue. A word that is not saved yet is calculated and shown in red. Save stores it. Leave keeps the red number for this printout only.'
          : 'Type a line with saved numbers and any words you still need. Example: 47 said 52. A number with more than one word stays open until you lock one. Unknown words go to Searching for.'}
      </Text>
      <Text style={[styles.label, { color: colors.muted }]}>Title</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
        value={title}
        onChangeText={setTitle}
        placeholder="Optional title"
        placeholderTextColor={colors.faint}
      />
      <Text style={[styles.label, { color: colors.muted }]}>Numbers and words</Text>
      <TextInput
        style={[styles.input, styles.tall, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
        value={draft}
        onChangeText={setDraft}
        placeholder={mode === 'words' ? 'Frigg said the word' : '47 said 52\n52 60 58'}
        placeholderTextColor={colors.faint}
        multiline
        autoCapitalize="none"
      />
      <View style={styles.methodRow}>
        {METHODS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.chip, { borderColor: colors.cardBorder }, method === item.id && { backgroundColor: colors.blue, borderColor: colors.blue }]}
            onPress={() => setMethod(item.id)}
          >
            <Text style={{ color: method === item.id ? '#fff' : colors.faint, fontSize: 13 }}>{item.short}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[styles.show, { backgroundColor: colors.blue }]} onPress={show} disabled={busy}>
        <Text style={styles.showText}>{busy ? 'Building…' : 'Show printout'}</Text>
      </TouchableOpacity>
      {!!notice && <Text style={[styles.notice, { color: colors.faint }]}>{notice}</Text>}

      {lines.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{title.trim() || 'Number sentence'}</Text>
          <View style={styles.rule} />
          {lines.map((line, li) => (
            <View key={`line-${li}`} style={styles.poemLine}>
              {line.length === 0 ? <Text style={styles.word}> </Text> : null}
              {line.map((token) => {
                const phrase = chosenPhrase(token);
                const open = token.kind === 'number' && token.hits.length > 1 && !locks[token.key];
                const red = !!(token.offerSave && !token.saved);
                return (
                  <View key={token.key} style={styles.slot}>
                    <Text style={styles.word}>{phrase || (open ? '·' : token.raw)}</Text>
                    {!!(token.kind === 'word' ? token.number : token.raw) && (
                      <Text style={[styles.number, red && styles.numberNew]}>
                        {token.kind === 'word' || token.kind === 'literal' ? token.number : token.raw}
                      </Text>
                    )}
                    {mode === 'numbers' && token.searching ? <Text style={styles.searching}>searching</Text> : null}
                    {red && !token.left && (
                      <View style={styles.saveRow}>
                        <TouchableOpacity onPress={() => storeWord(token)}>
                          <Text style={styles.saveText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => markToken(token.key, { left: true })}>
                          <Text style={styles.leaveText}>Leave</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {open && (
                      <View style={styles.options}>
                        {token.hits.map((hit) => (
                          <TouchableOpacity
                            key={hit.id}
                            style={styles.option}
                            onPress={() => setLocks((cur) => ({ ...cur, [token.key]: hit.phrase }))}
                          >
                            <Text style={styles.optionText}>{hit.phrase}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {token.kind === 'number' && token.hits.length > 1 && locks[token.key] ? (
                      <TouchableOpacity onPress={() => setLocks((cur) => ({ ...cur, [token.key]: '' }))}>
                        <Text style={styles.unlock}>Change</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  tall: { minHeight: 88, textAlignVertical: 'top' },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  show: { marginTop: 14, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  showText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  notice: { marginTop: 10, fontSize: 13 },
  card: {
    marginTop: 18,
    backgroundColor: '#1c140f',
    borderWidth: 1,
    borderColor: '#c4a574',
    borderRadius: 8,
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  cardTitle: {
    color: '#f3e6c8',
    fontSize: 28,
    fontStyle: 'italic',
    textAlign: 'center',
    fontWeight: '600',
  },
  rule: {
    alignSelf: 'center',
    width: 180,
    height: 1,
    backgroundColor: '#c4a574',
    marginTop: 8,
    marginBottom: 18,
  },
  poemLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 10,
  },
  slot: { alignItems: 'center', maxWidth: 160 },
  word: { color: '#f6f1e6', fontSize: 18, textAlign: 'center' },
  number: { color: '#6ea8d8', fontSize: 13, marginTop: 2, textAlign: 'center' },
  numberNew: { color: '#e85d5d' },
  saveRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveText: { color: '#f3e6c8', fontSize: 12, fontWeight: '700' },
  leaveText: { color: '#c4a574', fontSize: 12 },
  searching: { color: '#c4a574', fontSize: 10, marginTop: 2 },
  options: { marginTop: 6, gap: 4 },
  option: {
    borderWidth: 1,
    borderColor: '#c4a574',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  optionText: { color: '#f3e6c8', fontSize: 13 },
  unlock: { color: '#c4a574', fontSize: 11, marginTop: 4 },
});
