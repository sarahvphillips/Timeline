import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { saveEvent } from '../services/eventService';

const CATEGORIES = ['personal', 'work', 'family', 'health', 'other'];
const NEXT_ACTIONS = [
  { id: 'none', label: 'None' },
  { id: 'ask_grok_reply', label: 'Ask Grok to draft a reply' },
  { id: 'follow_up', label: 'Follow up' },
];

const SNAPSHOT = [
  {
    id: '1a0971bbb8c35868',
    from: 'Grok',
    fromEmail: 'noreply@x.ai',
    subject: 'New VID-3221 added, hashes done',
    date: '2026-09-12',
    snippet: 'Daily Drive video checksum watch is ready. New VID-3221 added, hashes done.',
  },
  {
    id: '1a096e13be9c78fb',
    from: 'Temu',
    fromEmail: 'temu@eu.temuemail.com',
    subject: 'Thank you for your order',
    date: '2026-09-12',
    snippet: 'We selected goodies for you.',
  },
  {
    id: '1a0969fc5f8c4ab3',
    from: 'Grok',
    fromEmail: 'noreply@x.ai',
    subject: 'Temu delivered, doorbell pending',
    date: '2026-09-12',
    snippet: 'Check emails for purchases and deliveries is ready. Temu delivered, doorbell pending.',
  },
  {
    id: '1a0967325e9d605e',
    from: 'Temu',
    fromEmail: 'temu@eu.temuemail.com',
    subject: 'Sarah Phillips, have you received it?',
    date: '2026-09-12',
    snippet: 'We sent Credit Back on Sept 12, 2026. Please confirm it ASAP.',
  },
  {
    id: '1a0963b03fdf75fa',
    from: 'Grok',
    fromEmail: 'noreply@x.ai',
    subject: 'Timeline? Confirm details now',
    date: '2026-09-12',
    snippet: 'To Timeline? If yes, please confirm any extra details.',
  },
  {
    id: '1a0955682151b772',
    from: 'Indeed',
    fromEmail: 'donotreply@match.indeed.com',
    subject: 'Part-Time QA Tester – Mobile & Web Applications',
    date: '2026-09-12',
    snippet: '£25,000 - £30,000 a year. Your computer science degree could be a good fit.',
  },
];

function guessCategory(mail) {
  const blob = `${mail.from} ${mail.fromEmail} ${mail.subject}`.toLowerCase();
  if (/temu|amazon|uber|hellofresh|order|delivery|receipt/.test(blob)) return 'other';
  if (/job|indeed|codecademy|grok|checksum|drive/.test(blob)) return 'work';
  if (/family|school/.test(blob)) return 'family';
  return 'personal';
}

function grokPrompt(mail, note) {
  return [
    'Please draft a reply to this email.',
    `Subject: ${mail.subject}`,
    `From: ${mail.from} <${mail.fromEmail}>`,
    `Date: ${mail.date}`,
    '--- Original email text ---',
    [mail.snippet, note].filter(Boolean).join('\n\n'),
    '--- End of email ---',
    'Write a clear, polite draft reply I can copy and send.',
  ].join('\n');
}

export default function PickFromGmailScreen({ navigation }) {
  const [picked, setPicked] = useState(null);
  const [category, setCategory] = useState('other');
  const [nextAction, setNextAction] = useState('ask_grok_reply');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => SNAPSHOT, []);

  const open = (mail) => {
    setPicked(mail);
    setCategory(guessCategory(mail));
    setNextAction('ask_grok_reply');
    setNote('');
  };

  const handleSave = async () => {
    if (!picked || saving) return;
    setSaving(true);
    try {
      const body = [picked.snippet, note.trim()].filter(Boolean).join('\n\n');
      await saveEvent({
        title: picked.subject,
        description: body,
        date: new Date(`${picked.date}T12:00:00`).toISOString(),
        category,
        source: 'email',
        nextAction,
        emailFrom: picked.fromEmail,
      });
      if (nextAction === 'ask_grok_reply') {
        const prompt = grokPrompt(picked, note.trim());
        try {
          await Share.share({ message: prompt });
        } catch (_) {
          Alert.alert('Saved', 'Ask Grok prompt is ready. Paste it into Grok.');
        }
      } else {
        Alert.alert('Saved', 'Email event is on your timeline.');
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Pick from Gmail</Text>
      <Text style={styles.intro}>
        Snapshot inbox (12 Sep). Tap a mail, set category and next action, save as an email event.
        Live Gmail refresh stays in the web preview for now.
      </Text>

      {list.map((mail) => (
        <TouchableOpacity key={mail.id} style={styles.card} onPress={() => open(mail)}>
          <Text style={styles.subject}>{mail.subject}</Text>
          <Text style={styles.meta}>
            {mail.from} · {mail.date}
          </Text>
          <Text style={styles.snippet} numberOfLines={2}>
            {mail.snippet}
          </Text>
        </TouchableOpacity>
      ))}

      {picked ? (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{picked.subject}</Text>
          <Text style={styles.meta}>
            {picked.from} · {picked.fromEmail}
          </Text>
          <Text style={styles.body}>{picked.snippet}</Text>

          <Text style={styles.label}>Category</Text>
          <View style={styles.row}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipOn]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipOnText]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Next action</Text>
          <View style={styles.row}>
            {NEXT_ACTIONS.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.chip, nextAction === a.id && styles.chipOn]}
                onPress={() => setNextAction(a.id)}
              >
                <Text style={[styles.chipText, nextAction === a.id && styles.chipOnText]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Extra note</Text>
          <TextInput
            style={[styles.input, styles.note]}
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor="#64748b"
            multiline
          />

          <TouchableOpacity style={[styles.save, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save to Timeline'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setPicked(null)}>
            <Text style={styles.cancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 48 },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700' },
  intro: { color: '#64748b', fontSize: 13, lineHeight: 18, marginTop: 8, marginBottom: 16 },
  card: {
    backgroundColor: '#16182e',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  subject: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  meta: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  snippet: { color: '#94a3b8', fontSize: 13, marginTop: 6 },
  sheet: {
    marginTop: 12,
    backgroundColor: '#16182e',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    padding: 14,
  },
  sheetTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  body: { color: '#cbd5e1', fontSize: 14, marginTop: 10 },
  label: { color: '#94a3b8', fontSize: 14, marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#1a1b36',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipOn: { borderColor: '#3b82f6', backgroundColor: '#1e3a8a' },
  chipText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  chipOnText: { color: '#bfdbfe' },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
  },
  note: { minHeight: 72, textAlignVertical: 'top' },
  save: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  disabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
});
