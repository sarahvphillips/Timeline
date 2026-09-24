import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import {
  SANDBOX_TRANSACTIONS,
  getOpenBanking,
  connectSandbox,
  disconnectOpenBanking,
  importSandboxTransactions,
} from '../services/openBankingService';
import {
  getRewards,
  spendShopItem,
  hasPerk,
  CREDITS_PAUSED,
} from '../services/rewardsService';

const PERK = 'openBanking';
const COST = 6;

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(title + (message ? `\n\n${message}` : ''));
    return;
  }
  Alert.alert(title, message);
}

export default function OpenBankingScreen({ navigation }) {
  const [conn, setConn] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [picked, setPicked] = useState(() => new Set(SANDBOX_TRANSACTIONS.map((t) => t.id)));

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([getOpenBanking(), getRewards()]);
    setConn(c);
    setRewards(r);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unlocked = CREDITS_PAUSED || hasPerk(rewards, PERK);
  const credits = rewards?.credits || 0;
  const sandbox = conn?.status === 'sandbox';

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await spendShopItem(PERK);
      setRewards(next);
      setStatus('Open Banking perk unlocked.');
    } catch (e) {
      if (e?.code === 'NEED_CREDITS') {
        notify('Not enough credits', `You haven't got enough credits, you need ${COST - credits} more!`);
      } else if (e?.code === 'OWNED') {
        notify('Already yours', 'Open Banking is unlocked.');
      } else {
        notify('Shop', e?.message || 'Could not unlock.');
      }
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    notify(
      'Bank consent (sandbox)',
      'Live Open Banking would open Lloyds (or another bank) on their site. You would never type the PIN in Timeline. This sandbox skips that and pretends a Lloyds read-only link.',
    );
    setBusy(true);
    try {
      setConn(await connectSandbox());
      setStatus('Sandbox connected · Lloyds (sandbox).');
    } catch (e) {
      notify('Open Banking', e?.message || 'Could not connect.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      setConn(await disconnectOpenBanking());
      setStatus('Disconnected. Imported events stay on the timeline.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importPicked = async () => {
    setBusy(true);
    try {
      const { added, connection } = await importSandboxTransactions([...picked]);
      setConn(connection);
      setStatus(added ? `Imported ${added} as Banking events.` : 'Nothing new to import.');
    } catch (e) {
      notify('Import', e?.message || 'Could not import.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Banking</Text>
        <Text style={styles.heading}>Open Banking</Text>
        <Text style={styles.intro}>
          Optional. Read-only payments into Timeline (DDs, rent, card, large spend). Screenshots
          stay. Live Lloyds needs a TrueLayer / Yapily account later — never a bank password in
          this app.
        </Text>

        {!unlocked ? (
          <View style={styles.card}>
            <Text style={styles.title}>Credits perk · {COST} credits</Text>
            <Text style={styles.muted}>You have {credits}. Logging purchases by photo stays free.</Text>
            <TouchableOpacity style={styles.button} onPress={unlock} disabled={busy || credits < COST}>
              <Text style={styles.buttonText}>
                {credits >= COST ? `Unlock for ${COST}` : `Need ${COST} (have ${credits})`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {unlocked ? (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>
                {sandbox ? conn.institution || 'Sandbox' : 'Not connected'}
              </Text>
              <Text style={styles.muted}>
                {conn?.lastSyncedAt
                  ? `Last import ${String(conn.lastSyncedAt).replace('T', ' ').slice(0, 16)}`
                  : 'No import yet'}
              </Text>
              {sandbox ? (
                <TouchableOpacity style={styles.ghost} onPress={disconnect} disabled={busy}>
                  <Text style={styles.ghostText}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.button} onPress={connect} disabled={busy}>
                  <Text style={styles.buttonText}>Connect sandbox (Lloyds-shaped)</Text>
                </TouchableOpacity>
              )}
            </View>

            {sandbox ? (
              <>
                <Text style={styles.section}>Sandbox transactions</Text>
                <Text style={styles.muted}>
                  These are sample UK payments so we can wire import now. Live feed replaces this
                  list when a provider is attached.
                </Text>
                {SANDBOX_TRANSACTIONS.map((tx) => {
                  const on = picked.has(tx.id);
                  const done = (conn.importedIds || []).includes(tx.id);
                  return (
                    <TouchableOpacity
                      key={tx.id}
                      style={[styles.row, on && styles.rowOn]}
                      onPress={() => toggle(tx.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>
                          {tx.payee} · {tx.direction === 'in' ? '+' : '−'}£{tx.amount}
                        </Text>
                        <Text style={styles.muted}>
                          {tx.kind} · {tx.bookedAt}
                          {done ? ' · already imported' : ''}
                        </Text>
                      </View>
                      <Text style={styles.tick}>{on ? '●' : '○'}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={styles.button} onPress={importPicked} disabled={busy}>
                  <Text style={styles.buttonText}>{busy ? 'Importing…' : 'Import selected'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </>
        ) : null}

        {status ? <Text style={styles.status}>{status}</Text> : null}
        {CREDITS_PAUSED ? null : (
        <TouchableOpacity onPress={() => navigation.navigate('CreditsShop')}>
          <Text style={styles.link}>Credits shop</Text>
        </TouchableOpacity>
        )}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 110 },
  kicker: { color: '#93c5fd', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  section: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 6 },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2b4a',
    marginBottom: 12,
  },
  title: { color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  muted: { color: '#94a3b8', fontSize: 13, marginTop: 4, lineHeight: 18 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  ghost: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  ghostText: { color: '#e2e8f0', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#16182e',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  rowOn: { borderColor: '#3b82f6' },
  rowTitle: { color: '#e2e8f0', fontWeight: '700' },
  tick: { color: '#60a5fa', fontSize: 18, marginLeft: 8 },
  status: { color: '#7dd3fc', marginTop: 14 },
  link: { color: '#7dd3fc', fontWeight: '700', marginTop: 16, textAlign: 'center' },
});
