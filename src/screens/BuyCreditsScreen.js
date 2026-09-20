import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import {
  CREDIT_PACKS,
  getRewards,
  applyPurchasedPack,
  claimPendingTransfers,
} from '../services/rewardsService';
import {
  playBillingSupported,
  fetchPlayCreditProducts,
  buyPlayCreditSku,
  endPlayBilling,
} from '../services/playBilling';
import { auth } from '../services/firebase';
import { loadAdmin, canSeeHomeAdmin } from '../services/adminService';

function notify(title, message, buttons) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(title + (message ? `\n\n${message}` : ''));
    return;
  }
  Alert.alert(title, message, buttons);
}

export default function BuyCreditsScreen({ navigation }) {
  const [credits, setCredits] = useState(0);
  const [staff, setStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [products, setProducts] = useState([]);
  const [storeReady, setStoreReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const added = await claimPendingTransfers();
      const rew = await getRewards();
      setCredits(rew.credits || 0);
      if (added) setStatus(`You received ${added} credits from a transfer.`);
    } catch {
      setCredits(0);
    }
    try {
      const s = await loadAdmin(auth.currentUser?.email);
      setStaff(canSeeHomeAdmin(auth.currentUser?.email, s));
    } catch {
      setStaff(false);
    }
    if (playBillingSupported()) {
      try {
        const list = await fetchPlayCreditProducts();
        setProducts(list);
        setStoreReady(list.some((p) => p.ready));
      } catch (e) {
        setStoreReady(false);
        setStatus(e?.message || 'Play Billing not connected.');
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        endPlayBilling();
      };
    }, [load])
  );

  const packView = (pack) => products.find((p) => p.sku === pack.sku) || pack;

  const buy = async (pack) => {
    if (busy) return;
    setBusy(true);
    setStatus('');
    try {
      if (playBillingSupported()) {
        const next = await buyPlayCreditSku(pack.sku);
        setCredits(next.credits);
        setStatus(`Play purchase of ${pack.sku} — you now have ${next.credits} credits.`);
        return;
      }
      if (staff) {
        notify(
          'Purchase credits',
          `Expo Go has no Play Billing. Grant ${pack.credits} credit${pack.credits === 1 ? '' : 's'} as a license tester for SKU ${pack.sku}? Same as Mafia tester accounts. This cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Buy!',
              onPress: async () => {
                try {
                  const next = await applyPurchasedPack(pack.sku, { tester: true });
                  setCredits(next.credits);
                  setStatus(`Tester grant ${pack.sku} — you now have ${next.credits} credits.`);
                } catch (e) {
                  setStatus(e?.message || 'Purchase failed.');
                }
              },
            },
          ],
        );
        return;
      }
      notify(
        'Google Play SKUs',
        `Create these in-app products (consumable) on Play Console for ${'com.sarahphillips.timelineapp'}:\n\n1_credits\n10_credits\n25_credits\n100_credits\n\nSame ids as Mafia. Then install a store/dev build (not Expo Go) so Buy opens Google Play.`,
      );
    } catch (e) {
      if (e?.code === 'NO_IAP_MODULE' && staff) {
        notify(
          'Purchase credits',
          `Play Billing module is not in this build. Tester-grant ${pack.credits} for SKU ${pack.sku}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Buy!',
              onPress: async () => {
                try {
                  const next = await applyPurchasedPack(pack.sku, { tester: true });
                  setCredits(next.credits);
                  setStatus(`Tester grant ${pack.sku} — you now have ${next.credits} credits.`);
                } catch (err) {
                  setStatus(err?.message || 'Purchase failed.');
                }
              },
            },
          ],
        );
      } else {
        setStatus(e?.message || 'Purchase failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Credits shop</Text>
        <Text style={styles.heading}>Purchase credits</Text>
        <Text style={styles.intro}>
          Google Play in-app products (consumable), same SKUs as Mafia. Package{' '}
          com.sarahphillips.timelineapp — 1_credits, 10_credits, 25_credits, 100_credits. Play
          prices show when this is a store build; Expo Go cannot talk to BillingClient.
          {storeReady ? ' Play Billing is connected.' : ''}
        </Text>
        <View style={styles.balance}>
          <Text style={styles.balanceNum}>{credits}</Text>
          <Text style={styles.balanceLabel}>You currently have {credits} credits</Text>
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}

        {CREDIT_PACKS.map((pack) => {
          const view = packView(pack);
          return (
            <View key={pack.sku} style={styles.card}>
              <Text style={styles.title}>
                {view.title || `${pack.credits} credit${pack.credits === 1 ? '' : 's'}`}
              </Text>
              <Text style={styles.sku}>{pack.sku}</Text>
              <Text style={styles.price}>{view.priceLabel || 'Play Store'}</Text>
              <TouchableOpacity style={styles.button} onPress={() => buy(pack)} disabled={busy}>
                <Text style={styles.buttonText}>
                  {busy ? 'Please wait…' : `Buy ${pack.credits}`}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.ghost}
          onPress={() => navigation.navigate('TransferCredits')}
        >
          <Text style={styles.ghostText}>Transfer credits</Text>
        </TouchableOpacity>
        {staff ? (
          <TouchableOpacity style={styles.ghost} onPress={() => navigation.navigate('Admin')}>
            <Text style={styles.ghostText}>Admin: set balance</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => navigation.navigate('CreditsShop')}>
          <Text style={styles.link}>Back to shop</Text>
        </TouchableOpacity>
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
  balance: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceNum: { color: '#c4b5fd', fontSize: 36, fontWeight: '800' },
  balanceLabel: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  status: { color: '#7dd3fc', marginBottom: 12 },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2b4a',
    marginBottom: 10,
  },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  sku: { color: '#64748b', fontSize: 12, marginTop: 4 },
  price: { color: '#c4b5fd', fontSize: 16, fontWeight: '800', marginTop: 6, marginBottom: 10 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  ghost: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  ghostText: { color: '#e2e8f0', fontWeight: '700' },
  link: { color: '#7dd3fc', fontWeight: '700', marginTop: 16, textAlign: 'center' },
});
