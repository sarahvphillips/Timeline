import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../themeContext';
import { getDateFormat, DATE_FORMAT_DMY } from '../services/dateFormat';
import { loadSearchCorpus, prepareSearch, searchPrepared } from '../services/contentSearch';

export default function SearchScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [corpus, setCorpus] = useState(null);
  const [dateFormat, setDateFormat] = useState(DATE_FORMAT_DMY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [next, format] = await Promise.all([
        loadSearchCorpus(),
        getDateFormat().catch(() => DATE_FORMAT_DMY),
      ]);
      setCorpus(next);
      setDateFormat(format || DATE_FORMAT_DMY);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const records = useMemo(() => (corpus ? prepareSearch(corpus, dateFormat) : []), [corpus, dateFormat]);
  const result = useMemo(() => searchPrepared(records, query), [records, query]);

  const openHit = (hit) => {
    if (!hit?.open?.screen) return;
    navigation.navigate(hit.open.screen, hit.open.params || {});
  };

  const status = () => {
    if (loading && !corpus) return 'Looking through what you have saved…';
    if (result.tooShort) return 'Type at least two letters or numbers.';
    if (!query.trim()) return 'Events, people, food, poems, notes, to-dos, and the other lists.';
    if (!result.total) return 'Nothing matched. Try a word from a title, a note, or a name.';
    if (result.total > result.hits.length) {
      return `Showing ${result.hits.length} of ${result.total}. Add another word to narrow it.`;
    }
    return `${result.total} ${result.total === 1 ? 'match' : 'matches'}`;
  };

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search what you've added"
          placeholderTextColor={colors.faint}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.faint} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.status}>{status()}</Text>
      {loading && !corpus ? (
        <ActivityIndicator color={colors.blue} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={query.trim().length >= 2 ? result.hits : []}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openHit(item)} activeOpacity={0.8}>
              <View style={styles.rowTop}>
                <Text style={styles.kind}>{item.kind}</Text>
                {item.when ? <Text style={styles.when}>{item.when}</Text> : null}
              </View>
              <Text style={styles.title}>{item.title}</Text>
              {item.snippet ? <Text style={styles.snippet}>{item.snippet}</Text> : null}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      margin: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
    },
    input: {
      flex: 1,
      color: c.text,
      fontSize: 16,
      paddingVertical: 12,
    },
    status: { color: c.faint, fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    row: {
      backgroundColor: c.card,
      borderColor: c.cardBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    kind: { color: c.blueSoft, fontSize: 12, fontWeight: '700' },
    when: { color: c.faint, fontSize: 12 },
    title: { color: c.text, fontSize: 16, fontWeight: '700' },
    snippet: { color: c.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  });
}
