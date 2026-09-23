import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Image,
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
  LOOKUP_METHODS,
  scrubWordNumberDuplicates,
  LIST_SORTS,
  getListSort,
  setListSort,
  sortWordNumberList,
  formatAddedAt,
  WORD_NUMBERS_FIRESTORE_SYNC_ENABLED,
} from '../services/wordToIntService';
import { getSpans, findSpansForNumber } from '../services/dateSpanService';
import { saveEvent } from '../services/eventService';
import { auth } from '../services/firebase';
import {
  createWordListShare,
  qrImageUrl,
} from '../services/shareService';
import {
  getRewards,
  spendShopItem,
  hasPerk,
  SHARE_WORDS_COST,
  SHARE_WORDS_PERK,
} from '../services/rewardsService';
import { loadAdmin, canSeeHomeAdmin } from '../services/adminService';
import WordGraphScreen from './WordGraphScreen';

function isDayCount(n) {
  return Number.isInteger(n) && n >= 1 && n <= 200000;
}

function phraseKey(phrase) {
  return String(phrase || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function findSavedPhrase(list, phrase) {
  const key = phraseKey(phrase);
  if (!key) return null;
  const letters = key.replace(/[^a-z]/g, '');
  return (
    (Array.isArray(list) ? list : []).find((item) => {
      const itemKey = phraseKey(item?.phrase);
      if (itemKey === key) return true;
      const itemLetters = itemKey.replace(/[^a-z]/g, '');
      return !!(letters && itemLetters === letters);
    }) || null
  );
}

class WordToIntBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0f1024', padding: 24 }}>
          <Text style={{ color: '#f8fafc', fontSize: 22, fontWeight: '800' }}>Word to int</Text>
          <Text style={{ color: '#fca5a5', marginTop: 12, fontSize: 15, lineHeight: 22 }}>
            {String(this.state.error?.message || this.state.error)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function displayHash(item) {
  if (item?.hashCode != null && !Number.isNaN(Number(item.hashCode))) {
    return item.hashCode;
  }
  return javaHashCode(item?.phrase || '');
}

export default function WordToIntRoute(props) {
  return (
    <WordToIntBoundary>
      <WordToIntScreen {...props} />
    </WordToIntBoundary>
  );
}

function WordToIntScreen({ navigation, route }) {
  const [phrase, setPhrase] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState('ordinal');
  const [list, setList] = useState([]);
  const [spans, setSpans] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookupNumber, setLookupNumber] = useState('');
  const [dupNotice, setDupNotice] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const savingRef = useRef(false);
  const [sortMode, setSortMode] = useState('added');
  const [lookupMethod, setLookupMethod] = useState('ordinal');
  const [pickMode, setPickMode] = useState(false);
  const [selected, setSelected] = useState({});
  const [shareResult, setShareResult] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [staff, setStaff] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const lastPhraseParam = useRef(null);

  const result =
    typeof convertPhrase === 'function'
      ? convertPhrase(phrase)
      : {
          phrase: String(phrase || '').trim(),
          ordinal: 0,
          pythagorean: 0,
          reverse: 0,
          hashCode: 0,
          letterCount: 0,
          reducedOrdinal: { value: 0 },
          breakdown: [],
        };
  const duplicateHit = findSavedPhrase(list, result.phrase || phrase);
  const editingItem = list.find((item) => String(item.id) === String(editingId)) || null;
  const conflicts = !!(
    duplicateHit && String(duplicateHit.id) !== String(editingId || '')
  );
  const showDup = conflicts || dupNotice;
  const methods = Array.isArray(METHODS) ? METHODS : [];
  const lookupMethods = Array.isArray(LOOKUP_METHODS) ? LOOKUP_METHODS : [];
  const sortedList = useMemo(
    () => (typeof sortWordNumberList === 'function' ? sortWordNumberList(list, sortMode) : list),
    [list, sortMode]
  );

  const pickSort = async (id) => {
    setSortMode(id);
    await setListSort(id);
  };

  const alertDuplicate = () => {
    setDupNotice(true);
  };

  const startEdit = (item) => {
    if (!item) return;
    setEditingId(item.id);
    setPhrase(item.phrase || '');
    setNotes(item.notes || '');
    setMethod(item.preferred || 'ordinal');
    setDupNotice(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPhrase('');
    setNotes('');
    setDupNotice(false);
  };

  const [noteDrafts, setNoteDrafts] = useState({});
  const noteSaveGen = useRef({});
  const NOTE_TAGS = ['#norse', '#binary', '#poem'];

  const noteValue = (item) =>
    Object.prototype.hasOwnProperty.call(noteDrafts, item.id) ? noteDrafts[item.id] : item.notes || '';

  const itemHasTag = (item, tag) => new RegExp(`(^|\\s)${tag}(?=\\s|$)`, 'i').test(noteValue(item));

  const saveItemNotes = async (item, nextNotes) => {
    const notes = String(nextNotes != null ? nextNotes : noteValue(item));
    const trimmed = notes.trim();
    const gen = (noteSaveGen.current[item.id] || 0) + 1;
    noteSaveGen.current[item.id] = gen;
    if (trimmed === String(item.notes || '').trim()) {
      if (noteSaveGen.current[item.id] !== gen) return;
      setNoteDrafts((cur) => {
        if (!Object.prototype.hasOwnProperty.call(cur, item.id)) return cur;
        if (String(cur[item.id] ?? '').trim() !== trimmed) return cur;
        const next = { ...cur };
        delete next[item.id];
        return next;
      });
      return;
    }
    try {
      await saveWordNumber({
        id: item.id,
        createdAt: item.createdAt,
        phrase: item.phrase,
        notes: trimmed,
        preferred: item.preferred || 'ordinal',
      });
      if (noteSaveGen.current[item.id] !== gen) return;
      setList((cur) => cur.map((row) => (row.id === item.id ? { ...row, notes: trimmed } : row)));
      setNoteDrafts((cur) => {
        if (String(cur[item.id] ?? trimmed).trim() !== trimmed) return cur;
        const next = { ...cur };
        delete next[item.id];
        return next;
      });
    } catch (e) {
      if (noteSaveGen.current[item.id] !== gen) return;
      Alert.alert('Could not save the note', e?.message || 'Try again.');
    }
  };

  const addNoteTag = (item, tag) => {
    if (itemHasTag(item, tag)) return;
    const next = `${noteValue(item).trim()} ${tag}`.trim();
    setNoteDrafts((cur) => ({ ...cur, [item.id]: next }));
    saveItemNotes(item, next);
  };

  const loadList = useCallback(async () => {
    // Await cloud pull before showing saved list (avoids empty-then-fill flash).
    setListLoading(true);
    try {
      const [words, savedSpans, savedSort] = await Promise.all([
        getWordNumbers(),
        getSpans(),
        getListSort(),
      ]);
      setList(Array.isArray(words) ? words : []);
      setSpans(Array.isArray(savedSpans) ? savedSpans : []);
      setSortMode(savedSort);
    } finally {
      setListLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadList();
      getRewards().then(setRewards).catch(() => setRewards(null));
      loadAdmin(auth.currentUser?.email)
        .then((s) => setStaff(canSeeHomeAdmin(auth.currentUser?.email, s)))
        .catch(() => setStaff(false));
      const incoming = route?.params?.phrase;
      const stamp = route?.params?.t || incoming;
      if (incoming && stamp !== lastPhraseParam.current) {
        lastPhraseParam.current = stamp;
        setPhrase(incoming);
        if (route.params?.preferred) setMethod(route.params.preferred);
        if (route.params?.notes) setNotes(route.params.notes);
      }
      const timer = setInterval(() => {
        scrubWordNumberDuplicates()
          .then((words) => {
            if (Array.isArray(words)) setList(words);
          })
          .catch(() => {});
      }, 60 * 1000);
      return () => clearInterval(timer);
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
    if (savingRef.current) return;
    if (!result.phrase) {
      Alert.alert('Missing phrase', 'Type a word or short phrase first.');
      return;
    }
    if (conflicts) {
      alertDuplicate();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await saveWordNumber({
        id: editingId || undefined,
        createdAt: editingItem?.createdAt,
        phrase: result.phrase,
        notes,
        preferred: method,
      });
      const wasEdit = !!editingId;
      setPhrase('');
      setNotes('');
      setEditingId(null);
      setDupNotice(false);
      await loadList();
      Alert.alert(
        saved.cloudSaved ? (wasEdit ? 'Updated' : 'Saved on phone and Firebase') : 'Saved on this phone only',
        saved.cloudSaved
          ? `"${saved.phrase}" = ${preferredNumber(saved)} (${saved.preferred || method})`
          : `"${saved.phrase}" is on this device. Firebase: ${saved.cloudError || 'not signed in or Firestore is off'}.`
      );
    } catch (e) {
      const msg = String(e?.message || '');
      if (e?.code === 'DUPLICATE_PHRASE' || /already saved/i.test(msg)) {
        alertDuplicate();
      } else {
        Alert.alert('Error', e?.message || 'Could not save this number.');
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSaveTimeline = async () => {
    if (savingRef.current) return;
    if (!result.phrase) {
      Alert.alert('Missing phrase', 'Type a word or short phrase first.');
      return;
    }
    if (conflicts) {
      alertDuplicate();
      return;
    }
    const number = currentNumber();
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await saveWordNumber({
        id: editingId || undefined,
        createdAt: editingItem?.createdAt,
        phrase: result.phrase,
        notes,
        preferred: method,
      });
      await saveEvent({
        title: `${result.phrase} = ${number}`,
        description: [
          `Phrase: ${result.phrase}`,
          `Method: ${methods.find((m) => m.id === method)?.label}`,
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
      setPhrase('');
      setNotes('');
      setEditingId(null);
      setDupNotice(false);
      await loadList();
      Alert.alert(
        saved.cloudSaved ? 'Saved on phone, timeline and Firebase' : 'Saved on this phone only',
        saved.cloudSaved
          ? `"${result.phrase}" is on the number list, timeline, and Firebase.`
          : `"${result.phrase}" is on this device. Firebase: ${saved.cloudError || 'not signed in or Firestore is off'}.`
      );
    } catch (e) {
      const msg = String(e?.message || '');
      if (e?.code === 'DUPLICATE_PHRASE' || /already saved/i.test(msg)) {
        alertDuplicate();
      } else {
        Alert.alert('Error', e?.message || 'Could not save to the timeline.');
      }
    } finally {
      savingRef.current = false;
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
      setSelected((cur) => {
        const copy = { ...cur };
        delete copy[item.id];
        return copy;
      });
    } catch {
      Alert.alert('Error', 'Could not delete this item.');
    }
  };

  const wordsUnlocked = hasPerk(rewards, SHARE_WORDS_PERK);
  const selectedItems = sortedList.filter((item) => selected[item.id]);

  const toggleWord = (id) => {
    setSelected((cur) => ({ ...cur, [id]: !cur[id] }));
  };

  const selectAll = () => {
    const next = {};
    sortedList.forEach((item) => {
      next[item.id] = true;
    });
    setSelected(next);
  };

  const unlockShare = async () => {
    if (unlocking) return;
    setUnlocking(true);
    try {
      const next = await spendShopItem(SHARE_WORDS_PERK);
      setRewards(next);
      Alert.alert('Unlocked', `Share word list is on. Credits left: ${next.credits}.`);
    } catch (e) {
      if (e?.code === 'NEED_CREDITS') {
        Alert.alert('Not enough credits', e.message, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Credits shop',
            onPress: () => navigation.navigate('CreditsShop'),
          },
        ]);
      } else if (e?.code === 'OWNED') {
        Alert.alert('Already yours', 'Share word list is already unlocked.');
      } else {
        Alert.alert('Shop', e?.message || 'Could not unlock.');
      }
    } finally {
      setUnlocking(false);
    }
  };

  const startPick = () => {
    if (!wordsUnlocked) {
      Alert.alert(
        'Credits perk',
        `Share some or all of this list with a friend. Unlock for ${SHARE_WORDS_COST} credits.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: unlocking ? '…' : `Unlock (${SHARE_WORDS_COST} credits)`, onPress: unlockShare },
        ],
      );
      return;
    }
    setPickMode(true);
    setShareResult(null);
  };

  const sharePicked = async () => {
    if (!selectedItems.length) {
      Alert.alert('Pick words', 'Tick some words, or tap Select all.');
      return;
    }
    setSharing(true);
    try {
      const result = await createWordListShare(selectedItems);
      setShareResult(result);
      setPickMode(false);
    } catch (e) {
      Alert.alert('Could not share', e?.message || 'Try again when signed in.');
    } finally {
      setSharing(false);
    }
  };

  const reuseItem = (item) => {
    startEdit(item);
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

  const matches =
    typeof findPhrasesForNumber === 'function' ? findPhrasesForNumber(list, lookupNumber, lookupMethod) : [];
  const spanMatches = typeof findSpansForNumber === 'function' ? findSpansForNumber(spans, lookupNumber) : [];
  const number = currentNumber();
  const showDayCount = isDayCount(number);

  if (showGraph) {
    return <WordGraphScreen onClose={() => setShowGraph(false)} />;
  }

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
      <Text style={styles.label}>Match using</Text>
      <View style={styles.methodRow}>
        {lookupMethods.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.methodChip, lookupMethod === m.id && styles.methodChipOn]}
            onPress={() => setLookupMethod(m.id)}
          >
            <Text style={[styles.methodText, lookupMethod === m.id && styles.methodTextOn]}>
              {m.short}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!String(lookupNumber).trim() && (
        <View style={styles.lookupCard}>
          {matches.length === 0 && spanMatches.length === 0 ? (
            <Text style={styles.empty}>
              No saved word
              {lookupMethod === 'all' ? '' : ` with ${lookupMethod} ${String(lookupNumber).trim()}`}.
              {lookupMethod !== 'all' ? ' Try All, or save the word first.' : ' Convert the word and tap Save to number list first.'}
            </Text>
          ) : (
            <>
              {matches.map((item) => (
                <TouchableOpacity key={item.id} style={styles.lookupRow} onPress={() => reuseItem(item)}>
                  <Text style={styles.itemPhrase}>{item.phrase}</Text>
                  <Text style={styles.itemMeta}>
                    {item.matchNumber} · {(item.matchOn || []).join(', ') || lookupMethod}
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
        onChangeText={(text) => {
          setPhrase(text);
          setDupNotice(false);
        }}
        placeholder="e.g. Figaro, North Star, rain"
        placeholderTextColor="#64748b"
        autoCapitalize="words"
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => {
          if (!savingRef.current) handleSaveList();
        }}
      />
      {editingId ? (
        <Text style={styles.meta}>Editing this saved word. Update keeps the same row.</Text>
      ) : null}
      {showDup ? (
        <Text style={styles.dupMsg}>that word is already saved in the list!</Text>
      ) : null}

      <Text style={styles.label}>Method</Text>
      <View style={styles.methodRow}>
        {methods.map((m) => (
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
            {methods.find((m) => m.id === method)?.label}
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

      <TouchableOpacity
        style={styles.button}
        onPress={() => (showDup && duplicateHit && !editingId ? startEdit(duplicateHit) : handleSaveList())}
        disabled={saving}
      >
        <Text style={styles.buttonText}>
          {saving ? 'Saving…' : showDup && !editingId ? 'Edit saved word' : editingId ? 'Update this word' : 'Save to number list'}
        </Text>
      </TouchableOpacity>
      {showDup ? (
        <Text style={styles.dupMsg}>that word is already saved in the list!</Text>
      ) : null}
      {editingId ? (
        <TouchableOpacity style={[styles.button, styles.ghost]} onPress={cancelEdit} disabled={saving}>
          <Text style={styles.ghostText}>Cancel edit</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.button, styles.ghost, showDup && !editingId && styles.buttonDisabled]}
        onPress={handleSaveTimeline}
        disabled={saving || (showDup && !editingId)}
      >
        <Text style={styles.ghostText}>
          {editingId ? 'Update list + add to timeline' : 'Save list + add to timeline'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.listTitle}>Saved numbers</Text>
      <TouchableOpacity style={[styles.button, styles.ghost]} onPress={() => setShowGraph(true)}>
        <Text style={styles.ghostText}>Graph — words that share a number</Text>
      </TouchableOpacity>
      {list.length > 0 ? (
        <View style={styles.shareBar}>
          {!wordsUnlocked ? (
            <TouchableOpacity style={styles.button} onPress={unlockShare} disabled={unlocking}>
              <Text style={styles.buttonText}>
                {unlocking ? 'Unlocking…' : `Share list — ${SHARE_WORDS_COST} credits`}
              </Text>
            </TouchableOpacity>
          ) : pickMode ? (
            <>
              <Text style={styles.shareHint}>
                Tick words to share. Friend accepts the code on Enter invite code. Duplicates they
                already have are skipped.
              </Text>
              <View style={styles.sortRow}>
                <TouchableOpacity style={styles.sortChip} onPress={selectAll}>
                  <Text style={styles.sortChipText}>Select all</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortChip, styles.sortChipOn]}
                  onPress={sharePicked}
                  disabled={sharing}
                >
                  <Text style={styles.sortChipTextOn}>
                    {sharing ? 'Sharing…' : `Share ${selectedItems.length || 0}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sortChip}
                  onPress={() => {
                    setPickMode(false);
                    setSelected({});
                  }}
                >
                  <Text style={styles.sortChipText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={[styles.button, styles.ghost]} onPress={startPick}>
              <Text style={styles.ghostText}>Share some or all</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
      {shareResult ? (
        <View style={styles.shareCard}>
          <Text style={styles.itemPhrase}>Invite code</Text>
          <Text style={styles.itemNumber}>{shareResult.code}</Text>
          <Text style={styles.itemMeta}>Friend: Home → Enter invite code, or scan the QR.</Text>
          {shareResult.link ? (
            <Image source={{ uri: qrImageUrl(shareResult.link, 180) }} style={styles.qr} />
          ) : null}
          <TouchableOpacity onPress={() => copyText(shareResult.code)}>
            <Text style={styles.link}>Copy code</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {list.length > 0 ? (
        <View style={styles.sortRow}>
          {LIST_SORTS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.sortChip, sortMode === opt.id && styles.sortChipOn]}
              onPress={() => pickSort(opt.id)}
            >
              <Text style={[styles.sortChipText, sortMode === opt.id && styles.sortChipTextOn]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {list.length > 0 ? (
        <Text style={styles.inlineHint}>
          Edit a note on its row. Leaving the box saves it. The tags add #norse, #binary or #poem without going back to the top.
        </Text>
      ) : null}
      {listLoading ? (
        <View style={styles.listLoading}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.empty}>
            {WORD_NUMBERS_FIRESTORE_SYNC_ENABLED ? 'Syncing numbers…' : 'Loading…'}
          </Text>
        </View>
      ) : list.length === 0 ? (
        <Text style={styles.empty}>No saved numbers yet. Convert a phrase and save it here.</Text>
      ) : (
        sortedList.map((item) => (
          <View key={item.id} style={[styles.item, pickMode && selected[item.id] && styles.itemPicked]}>
            {pickMode ? (
              <TouchableOpacity onPress={() => toggleWord(item.id)} style={styles.pickRow}>
                <Text style={styles.tick}>{selected[item.id] ? '☑' : '☐'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemPhrase}>{item.phrase}</Text>
                  <Text style={styles.itemNumber}>{preferredNumber(item)}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => reuseItem(item)} style={styles.itemMain}>
                <Text style={styles.itemPhrase}>{item.phrase}</Text>
                <Text style={styles.itemNumber}>{preferredNumber(item)}</Text>
                <Text style={styles.itemAdded}>
                  Added {formatAddedAt(item.createdAt || item.updatedAt)}
                </Text>
                <Text style={styles.itemMeta}>
                  Ord {item.ordinal} · Pyth {item.pythagorean} · Rev {item.reverse} · Red {item.reduced} · hash {displayHash(item)}
                </Text>
              </TouchableOpacity>
            )}
            {!pickMode ? (
              <View>
                <TextInput
                  style={styles.inlineNote}
                  value={noteValue(item)}
                  onChangeText={(text) => setNoteDrafts((cur) => ({ ...cur, [item.id]: text }))}
                  onBlur={() => saveItemNotes(item)}
                  placeholder="Note"
                  placeholderTextColor="#64748b"
                  multiline
                />
                <View style={styles.tagRow}>
                  {NOTE_TAGS.map((tag) => {
                    const on = itemHasTag(item, tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[styles.tagChip, on && styles.tagChipOn]}
                        onPress={() => addNoteTag(item, tag)}
                      >
                        <Text style={[styles.tagChipText, on && styles.tagChipTextOn]}>{tag}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {!pickMode ? (
            <View style={styles.itemActions}>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={styles.link}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => copyText(preferredNumber(item))}>
                <Text style={styles.link}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={styles.delete}>Delete</Text>
              </TouchableOpacity>
            </View>
            ) : null}
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
  dupMsg: {
    color: '#fca5a5',
    backgroundColor: '#3f1d1d',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.45,
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
  shareBar: { marginBottom: 12 },
  shareHint: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  shareCard: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  qr: { width: 180, height: 180, marginVertical: 10, backgroundColor: '#fff' },
  pickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tick: { color: '#c4b5fd', fontSize: 22, width: 28 },
  itemPicked: { borderWidth: 1, borderColor: '#3b82f6' },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sortChipOn: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  sortChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  sortChipTextOn: {
    color: '#fff',
  },
  listLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  itemAdded: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemMeta: {
    color: '#64748b',
    fontSize: 12,
  },
  itemNotes: {
    color: '#94a3b8',
    marginTop: 6,
  },
  inlineHint: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  inlineNote: {
    backgroundColor: '#1a1b36',
    borderColor: '#2e2f55',
    borderWidth: 1,
    borderRadius: 10,
    color: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 40,
    marginTop: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  tagChip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagChipOn: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  tagChipText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  tagChipTextOn: { color: '#fff' },
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
