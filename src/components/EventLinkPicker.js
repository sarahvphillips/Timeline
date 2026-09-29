import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { getEvents } from '../services/eventService';
import { eventKindLabel } from '../services/eventLinkService';
import { useTheme } from '../themeContext';

export default function EventLinkPicker({ visible, excludeIds = [], selectedIds = [], onClose, onSave }) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState({});

  useEffect(() => {
    if (!visible) return;
    const start = {};
    (selectedIds || []).forEach((id) => {
      start[String(id)] = true;
    });
    setPicked(start);
    setQuery('');
    getEvents()
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch(() => setRows([]));
  }, [visible, selectedIds]);

  const blocked = new Set((excludeIds || []).map(String));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((event) => {
      if (!event?.id || blocked.has(String(event.id))) return false;
      if (!q) return true;
      const hay = `${event.title || ''} ${event.description || ''} ${eventKindLabel(event)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, excludeIds]);

  const toggle = (id) => {
    setPicked((cur) => ({ ...cur, [id]: !cur[id] }));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>Link events</Text>
        <Text style={[styles.hint, { color: colors.faint }]}>
          Pick a YouTube clip, social post, poem or any other event. They will point at each other.
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search title or type"
          placeholderTextColor={colors.faint}
        />
        <ScrollView style={{ flex: 1 }}>
          {shown.slice(0, 80).map((event) => {
            const on = !!picked[String(event.id)];
            return (
              <TouchableOpacity
                key={event.id}
                style={[styles.row, { borderColor: colors.cardBorder, backgroundColor: on ? colors.card : 'transparent' }]}
                onPress={() => toggle(String(event.id))}
              >
                <Text style={{ color: colors.blueSoft, width: 28, fontSize: 18 }}>{on ? '☑' : '☐'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{event.title || 'Untitled'}</Text>
                  <Text style={{ color: colors.faint, fontSize: 12, marginTop: 2 }}>
                    {eventKindLabel(event)}
                    {event.date ? ` · ${String(event.date).slice(0, 10)}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.faint, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.save, { backgroundColor: colors.blue }]}
            onPress={() => onSave(Object.keys(picked).filter((id) => picked[id]))}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Link selected</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 48, paddingHorizontal: 16, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  save: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
});
