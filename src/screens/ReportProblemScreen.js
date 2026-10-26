import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../themeContext';
import { createTicket, listMyTickets } from '../services/ticketService';

export default function ReportProblemScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    try {
      setRows(await listMyTickets());
    } catch (e) {
      setNote(e?.message || 'Could not load your reports.');
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      await createTicket({ title, detail });
      setTitle('');
      setDetail('');
      setNote('Sent. Sarah can read it in Admin. Nothing is emailed until she approves a draft.');
      await load();
    } catch (e) {
      setNote(e?.message || 'Could not send that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Report a problem</Text>
      <Text style={styles.intro}>
        This stays in the app for an admin to read. It does not send an email.
      </Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Short title"
        placeholderTextColor={colors.faint}
        maxLength={200}
      />
      <TextInput
        style={[styles.input, styles.multi]}
        value={detail}
        onChangeText={setDetail}
        placeholder="What happened"
        placeholderTextColor={colors.faint}
        multiline
        maxLength={5000}
      />
      <TouchableOpacity style={styles.primary} onPress={send} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send report</Text>}
      </TouchableOpacity>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <Text style={styles.section}>Your reports</Text>
      {!rows.length ? <Text style={styles.intro}>None yet.</Text> : null}
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.title}>{row.title}</Text>
          <Text style={styles.intro}>{row.status || 'open'}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
    pad: { padding: 20, paddingBottom: 48, backgroundColor: c.bg, flexGrow: 1 },
    heading: { color: c.text, fontSize: 28, fontWeight: '800' },
    section: { color: c.text, fontSize: 18, fontWeight: '700', marginTop: 24 },
    intro: { color: c.faint, fontSize: 14, lineHeight: 20, marginTop: 8 },
    note: { color: '#7dd3fc', marginTop: 12, lineHeight: 20 },
    title: { color: c.text, fontWeight: '700', fontSize: 16 },
    input: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: c.text,
      marginTop: 12,
    },
    multi: { minHeight: 100, textAlignVertical: 'top' },
    primary: {
      backgroundColor: c.blue,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    primaryText: { color: '#fff', fontWeight: '700' },
    card: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 12,
      marginTop: 8,
    },
  });
}
