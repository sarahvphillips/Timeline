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

function isNumberToken(raw) {
  return /^-?\d+$/.test(String(raw || '').trim());
}

export default function NumberSentenceScreen() {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('47 said 52');
  const [method, setMethod] = useState('ordinal');
  const [lines, setLines] = useState([]);
  const [locks, setLocks] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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

      setLines(nextLines);
      setNotice(
        added.length
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.page}>
      <Text style={[styles.intro, { color: colors.faint }]}>
        Test. Type a line with saved numbers and any words you still need. Example: 47 said 52.
        A number with more than one word stays open until you lock one. Unknown words go to Searching for.
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
        placeholder={'47 said 52\n52 60 58'}
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
                return (
                  <View key={token.key} style={styles.slot}>
                    <Text style={styles.word}>{phrase || (open ? '·' : token.raw)}</Text>
                    <Text style={styles.number}>{token.kind === 'word' ? token.number : token.raw}</Text>
                    {token.searching ? <Text style={styles.searching}>searching</Text> : null}
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
