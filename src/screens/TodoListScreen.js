import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateField from '../components/DateField';
import { getEventCategories } from '../services/profileService';
import { addTodo, completeTodo, loadTodos, removeTodo } from '../services/todoService';
import { getEvents } from '../services/eventService';
import { useTheme } from '../themeContext';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TodoListScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('personal');
  const [date, setDate] = useState(todayIso());
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [list, cats] = await Promise.all([
      loadTodos().catch(() => []),
      getEventCategories().catch(() => []),
    ]);
    setItems(list);
    setCategories(cats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = items.filter((row) => !row.doneAt);
  const done = items.filter((row) => row.doneAt);

  const add = async () => {
    setError('');
    try {
      const next = await addTodo({ title, note, category, date });
      setItems(next);
      setTitle('');
      setNote('');
    } catch (e) {
      setError(e?.message || 'Could not add that.');
    }
  };

  const tick = async (row) => {
    setBusyId(row.id);
    setError('');
    try {
      const saved = await completeTodo(row);
      await load();
      if (saved) navigation.navigate('EventView', { event: saved });
    } catch (e) {
      setError(e?.message || 'Could not save that on the timeline.');
    } finally {
      setBusyId('');
    }
  };

  const openDone = async (row) => {
    const events = await getEvents().catch(() => []);
    const event = events.find((item) => item.id === row.eventId);
    if (event) navigation.navigate('EventView', { event });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Write what you mean to do. Tick it when it is done, and it is saved on the timeline for the date below.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="To do"
        placeholderTextColor={colors.faint}
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={add}
      />
      <TextInput
        style={[styles.input, styles.note]}
        placeholder="Note, optional"
        placeholderTextColor={colors.faint}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <DateField value={date} onChange={setDate} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {categories.map((cat) => {
          const on = category === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, on && { backgroundColor: cat.color || colors.blue, borderColor: cat.color || colors.blue }]}
              onPress={() => setCategory(cat.id)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.add} onPress={add}>
        <Text style={styles.addText}>Add to list</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Open</Text>
      {open.length === 0 ? <Text style={styles.empty}>Nothing waiting.</Text> : null}
      {open.map((row) => (
        <View key={row.id} style={styles.row}>
          <TouchableOpacity
            style={styles.tick}
            onPress={() => tick(row)}
            disabled={busyId === row.id}
            accessibilityLabel={`Mark done: ${row.title}`}
          >
            {busyId === row.id ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Ionicons name="ellipse-outline" size={26} color={colors.blue} />
            )}
          </TouchableOpacity>
          <View style={styles.rowText}>
            <Text style={styles.title}>{row.title}</Text>
            {row.note ? <Text style={styles.noteText}>{row.note}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => removeTodo(row.id).then(setItems)} accessibilityLabel="Remove">
            <Ionicons name="close" size={20} color={colors.faint} />
          </TouchableOpacity>
        </View>
      ))}

      {done.length ? <Text style={styles.heading}>On the timeline</Text> : null}
      {done.map((row) => (
        <TouchableOpacity key={row.id} style={styles.row} onPress={() => openDone(row)}>
          <Ionicons name="checkmark-circle" size={26} color={colors.blue} />
          <View style={styles.rowText}>
            <Text style={styles.doneTitle}>{row.title}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 40 },
    intro: { color: c.faint, fontSize: 14, lineHeight: 20, marginBottom: 12 },
    input: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      color: c.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      marginBottom: 8,
    },
    note: { minHeight: 64, textAlignVertical: 'top' },
    chips: { gap: 8, paddingVertical: 10 },
    chip: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: { color: c.text, fontSize: 13 },
    chipTextOn: { color: '#fff', fontWeight: '700' },
    error: { color: c.danger || '#dc2626', marginBottom: 8 },
    add: {
      backgroundColor: c.blue,
      borderRadius: 10,
      alignItems: 'center',
      paddingVertical: 12,
      marginBottom: 18,
    },
    addText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    heading: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginTop: 8 },
    empty: { color: c.faint, marginBottom: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.card,
      borderColor: c.cardBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    tick: { width: 32, alignItems: 'center' },
    rowText: { flex: 1 },
    title: { color: c.text, fontSize: 16, fontWeight: '600' },
    noteText: { color: c.faint, fontSize: 13, marginTop: 2 },
    doneTitle: { color: c.faint, fontSize: 15, textDecorationLine: 'line-through' },
  });
}
