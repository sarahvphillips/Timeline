import React, { useCallback, useState } from 'react';
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
import HomeFab from '../components/HomeFab';
import { useTheme } from '../themeContext';
import { creditFeedbackItems, loadMyCreditFeedback, saveCreditFeedback } from '../services/creditFeedback';

const CHOICES = [
  { id: 'fair', label: 'Fair to pay' },
  { id: 'free', label: 'Should be free' },
  { id: 'unsure', label: 'Not sure' },
];

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(title + (message ? `\n\n${message}` : ''));
    return;
  }
  Alert.alert(title, message);
}

export default function CreditFeedbackScreen({ navigation }) {
  const { colors } = useTheme();
  const items = creditFeedbackItems();
  const [votes, setVotes] = useState({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadMyCreditFeedback().then((row) => {
        if (cancelled) return;
        setVotes(row.votes || {});
        setNote(row.note || '');
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveCreditFeedback({ votes, note });
      setSaved(true);
      notify('Saved', 'Thank you. This test still does not charge you.');
    } catch (e) {
      notify('Could not save', e?.message || 'Try again while signed in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.kicker, { color: colors.blueSoft }]}>Testing</Text>
        <Text style={[styles.heading, { color: colors.text }]}>Credits later</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Nothing on this test costs money or credits. Logging your timeline stays free. Later, a few extras may use credits. This page is only to explain that, and to ask what you think.
        </Text>
        <Text style={[styles.h, { color: colors.text }]}>How it would work</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          A credit is a small token on your account. You could earn a few by using Timeline (stamps, friends who join, saving a large graph). Packs would be bought only in the Android app from Google Play, not in the browser, and not by typing a card number into Timeline. Spending credits would unlock that extra. You are not being asked to buy any during this test.
        </Text>
        {items.map((item) => (
          <View key={item.id} style={[styles.card, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
            <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.body, { color: colors.muted, marginBottom: 6 }]}>{item.blurb}</Text>
            <Text style={[styles.cost, { color: colors.blueSoft }]}>
              Later: {item.cost} credit{item.cost === 1 ? '' : 's'}
              {item.eachTime ? ' each time' : ', once'}
            </Text>
            <View style={styles.row}>
              {CHOICES.map((choice) => {
                const on = votes[item.id] === choice.id;
                return (
                  <TouchableOpacity
                    key={choice.id}
                    style={[
                      styles.chip,
                      { borderColor: on ? colors.blue : colors.cardBorder, backgroundColor: on ? colors.blue : 'transparent' },
                    ]}
                    onPress={() => {
                      setSaved(false);
                      setVotes((cur) => ({ ...cur, [item.id]: choice.id }));
                    }}
                  >
                    <Text style={[styles.chipText, { color: on ? '#fff' : colors.text }]}>{choice.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        <Text style={[styles.h, { color: colors.text }]}>Anything else?</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          value={note}
          onChangeText={(value) => {
            setSaved(false);
            setNote(value);
          }}
          placeholder="Which of these feel worth paying for, if any?"
          placeholderTextColor={colors.faint}
          multiline
        />
        <TouchableOpacity
          style={[styles.save, { backgroundColor: colors.blue, opacity: saving ? 0.6 : 1 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : saved ? 'Saved' : 'Send my view'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 120 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heading: { fontSize: 28, fontWeight: '800', marginTop: 4, marginBottom: 8 },
  h: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cost: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 90, padding: 12, fontSize: 15, textAlignVertical: 'top', marginBottom: 12 },
  save: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
