import React,  useCallback, useState,
  useMemo from 'react';
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
import {
  MAX_CREDIT_TRANSFER,
  getRewards,
  transferCredits,
  claimPendingTransfers,
} from '../services/rewardsService';

function notify(title, message, buttons) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(title + (message ? `\n\n${message}` : ''));
    return;
  }
  Alert.alert(title, message, buttons);
}

export default function TransferCreditsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [credits, setCredits] = useState(0);
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const load = useCallback(async () => {
    try {
      await claimPendingTransfers();
      const rew = await getRewards();
      setCredits(rew.credits || 0);
    } catch {
      setCredits(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = () => {
    if (busy) return;
    const n = Math.floor(Number(amount));
    if (!email.trim()) {
      notify('Transfer', 'Please enter an email.');
      return;
    }
    if (!n || n <= 0) {
      notify('Transfer', 'Please enter an amount.');
      return;
    }
    if (n > MAX_CREDIT_TRANSFER) {
      notify('Transfer', 'That number is too large!');
      return;
    }
    notify(
      'Transfer Credits',
      `Are you sure you want to transfer ${n} Credits to ${email.trim()}?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setBusy(true);
            try {
              const sent = await transferCredits(email, n);
              const rew = await getRewards();
              setCredits(rew.credits || 0);
              setDone(`You transferred ${sent} credits to ${email.trim()}`);
              setAmount('');
            } catch (e) {
              notify('Transfer', e?.message || 'Could not send credits.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Purchase credits</Text>
        <Text style={styles.heading}>Transfer credits</Text>
        <Text style={styles.intro}>
          Send credits to another Timeline account. Max {MAX_CREDIT_TRANSFER} at a time (same cap as
          Mafia). They appear the next time that person opens the app.
        </Text>
        <Text style={styles.have}>You have {credits} credits available</Text>
        {done ? <Text style={styles.done}>{done}</Text> : null}

        <Text style={styles.label}>Their email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="friend@example.com"
          placeholderTextColor="#64748b"
        />
        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="1–100"
          placeholderTextColor="#64748b"
        />
        <TouchableOpacity style={styles.button} onPress={send} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Transfer'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('BuyCredits')}>
          <Text style={styles.link}>Back to purchase credits</Text>
        </TouchableOpacity>
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  content: { padding: 20, paddingBottom: 110 },
  kicker: { color: c.blueSoft, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heading: { color: c.text, fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: c.faint, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  have: { color: c.muted, fontWeight: '700', marginBottom: 12 },
  done: { color: '#86efac', marginBottom: 12 },
  label: { color: c.muted, fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: c.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
  },
  button: {
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: '#7dd3fc', fontWeight: '700', marginTop: 16, textAlign: 'center' },
});
}

