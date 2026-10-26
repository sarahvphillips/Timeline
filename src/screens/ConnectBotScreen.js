import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import { useTheme } from '../themeContext';
import { copyTextToClipboard } from '../services/shareService';
import { BOT_API_URL, createBotKey, listBotKeys, revokeBotKey } from '../services/botKeyService';
import { getEvents, deleteEvent } from '../services/eventService';

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(title + (message ? `\n\n${message}` : ''));
    return;
  }
  Alert.alert(title, message);
}

function confirm(title, message, onYes) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes', style: 'destructive', onPress: onYes },
  ]);
}

function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ConnectBotScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [keys, setKeys] = useState([]);
  const [botEvents, setBotEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, events] = await Promise.all([listBotKeys(), getEvents()]);
      setKeys(k);
      setBotEvents(
        (events || [])
          .filter((e) => e?.addedBy === 'bot')
          .sort((a, b) => new Date(b.date) - new Date(a.date)),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const create = async (replace) => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await createBotKey(label.trim() || 'Grok', { replace: replace === true });
      setNewKey(out);
      setLabel('');
      load();
    } catch (e) {
      notify('Could not create key', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text, what) => {
    const ok = await copyTextToClipboard(text);
    notify(ok ? 'Copied' : 'Copy failed', ok ? `${what} copied.` : 'Please select and copy it by hand.');
  };

  const revoke = (k) =>
    confirm('Revoke key?', `"${k.label || 'Bot'}" will stop working straight away.`, async () => {
      try {
        await revokeBotKey(k.hash);
        load();
      } catch (e) {
        notify('Could not revoke', e?.message || 'Please try again.');
      }
    });

  const removeEvent = (ev) =>
    confirm('Delete event?', `"${ev.title || 'Untitled'}" was added by a bot. Delete it?`, async () => {
      await deleteEvent(ev.id);
      load();
    });

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Settings</Text>
        <Text style={styles.heading}>Connect a bot</Text>
        <Text style={styles.intro}>
          One Grok bot can be connected at a time. The key only sees your timeline. You can replace it or revoke it.
        </Text>

        {keys.some((k) => !k.revoked) ? (
          <View style={styles.card}>
            <Text style={styles.title}>A Grok bot is already connected</Text>
            <Text style={styles.muted}>Replace retires the current key and shows a new one once.</Text>
            <TouchableOpacity
              style={styles.button}
              disabled={busy}
              onPress={() => confirm('Replace bot key?', 'The current key stops working as soon as the new one is created.', () => create(true))}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Replace with new key</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.section}>Create bot key</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                value={label}
                onChangeText={setLabel}
                placeholder="Name, e.g. Grok"
                placeholderTextColor={colors.faint}
                maxLength={60}
                onSubmitEditing={() => create(false)}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.button} onPress={() => create(false)} disabled={busy} activeOpacity={0.8}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create bot key</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {newKey ? (
          <View style={[styles.card, styles.keyCard]}>
            <Text style={styles.title}>Your new key: {newKey.label}</Text>
            <Text style={styles.warn}>
              Copy it now. It won't be shown again. Keep it private, like a password.
            </Text>
            <Text selectable style={styles.mono}>{newKey.key}</Text>
            <TouchableOpacity style={styles.button} onPress={() => copy(newKey.key, 'Key')}>
              <Text style={styles.buttonText}>Copy key</Text>
            </TouchableOpacity>
            <Text style={[styles.muted, { marginTop: 14 }]}>API URL</Text>
            <Text selectable style={styles.mono}>{BOT_API_URL}</Text>
            <TouchableOpacity style={styles.ghost} onPress={() => copy(BOT_API_URL, 'API URL')}>
              <Text style={styles.ghostText}>Copy API URL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={() => setNewKey(null)}>
              <Text style={styles.ghostText}>I've copied it, hide</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.section}>Your keys</Text>
        {loading ? <ActivityIndicator color={colors.blue} /> : null}
        {!loading && !keys.length ? <Text style={styles.muted}>No keys yet.</Text> : null}
        {keys.map((k) => (
          <View key={k.hash} style={styles.card}>
            <Text style={styles.title}>
              {k.label || 'Bot'} {k.revoked ? '(revoked)' : ''}
            </Text>
            <Text style={styles.muted}>
              Created {shortDate(k.createdAt)}
              {k.thisDevice ? ' · on this device' : ''}
            </Text>
            {k.offline ? null : <Text style={styles.muted}>Last used {shortDate(k.lastUsedAt)}</Text>}
            {!k.revoked ? (
              <TouchableOpacity style={styles.ghost} onPress={() => revoke(k)}>
                <Text style={[styles.ghostText, { color: '#f87171' }]}>Revoke</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <Text style={styles.section}>Added by bot</Text>
        <Text style={styles.muted}>
          Events a bot created. Also on the Items timeline under the "Added by bot" filter.
        </Text>
        {!loading && !botEvents.length ? <Text style={styles.muted}>None yet.</Text> : null}
        {botEvents.map((ev) => (
          <View key={ev.id} style={styles.row}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('EventView', { event: ev })}>
              <Text style={styles.title} numberOfLines={1}>{ev.title || 'Untitled'}</Text>
              <Text style={styles.muted}>{shortDate(ev.date)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeEvent(ev)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: '#f87171', fontWeight: '700' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}
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
    intro: { color: c.faint, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 8 },
    section: { color: c.text, fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 6 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.cardBorder,
      marginBottom: 12,
    },
    keyCard: { borderColor: c.blue },
    title: { color: c.text, fontSize: 16, fontWeight: '700' },
    muted: { color: c.faint, fontSize: 13, marginTop: 4, lineHeight: 18 },
    warn: { color: '#fbbf24', fontSize: 13, marginTop: 6, lineHeight: 18, fontWeight: '600' },
    mono: {
      color: c.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      marginTop: 8,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    input: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: c.text,
    },
    button: {
      backgroundColor: c.blue,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 12,
    },
    buttonText: { color: '#fff', fontWeight: '700' },
    ghost: {
      borderWidth: 1,
      borderColor: c.faint,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 10,
    },
    ghostText: { color: c.text, fontWeight: '700' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      marginTop: 8,
    },
  });
}
