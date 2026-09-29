import React, { useCallback, useState, useMemo } from 'react';
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
import { getRewards, SHOP_ITEMS, spendShopItem, hasPerk, perkLabel, claimPendingTransfers } from '../services/rewardsService';
import { auth } from '../services/firebase';
import { loadAdmin, canSeeHomeAdmin } from '../services/adminService';
import { useTheme } from '../themeContext';

export default function CreditsShopScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [rewards, setRewards] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [staff, setStaff] = useState(false);

  const load = useCallback(async () => {
    try {
      await claimPendingTransfers();
    } catch {
      /* pending transfers optional */
    }
    setRewards(await getRewards());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadAdmin(auth.currentUser?.email)
        .then((s) => setStaff(canSeeHomeAdmin(auth.currentUser?.email, s)))
        .catch(() => setStaff(false));
    }, [load])
  );

  const needMore = () => {
    if (staff) {
      Alert.alert(
        'Not enough credits',
        'Stay in the shop to test unlocks, or open Admin to set this account’s credits.',
        [
          { text: 'Stay in shop', style: 'cancel' },
          { text: 'Edit credits in Admin', onPress: () => navigation.navigate('Admin', { focus: 'credits' }) },
        ],
      );
      return;
    }
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Google Play only',
        'Credits are purchased in the Timeline app on Google Play, not in a browser.',
      );
      return;
    }
    navigation.navigate('BuyCredits');
  };

  const buy = async (item) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const next = await spendShopItem(item.id);
      setRewards(next);
      Alert.alert('Unlocked', `${item.title} is on this account. Credits left: ${next.credits}.`);
    } catch (e) {
      if (e?.code === 'OWNED') {
        Alert.alert('Already yours', item.title);
      } else if (e?.code === 'NEED_CREDITS') {
        Alert.alert('Not enough credits', `You haven't got enough credits, you need ${item.cost - credits} more!`, [
          { text: 'Stay in shop', style: 'cancel' },
          { text: staff ? 'Edit credits in Admin' : Platform.OS === 'android' ? 'Buy credits' : 'Play app only', onPress: needMore },
        ]);
      } else {
        Alert.alert('Shop', e?.message || 'Could not unlock this.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const credits = rewards?.credits || 0;
  const owned = (rewards?.unlockedPerks || []).map(perkLabel);

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Home</Text>
        <Text style={styles.heading}>Credits shop</Text>
        <Text style={styles.intro}>
          Credits come from friends who join Timeline, and from filling the first stamps row on Home.
          Nothing here is a streak. Spend when you want a perk that would usually cost.
        </Text>
        {staff ? (
          <View style={styles.adminBanner}>
            <Text style={styles.adminBannerTitle}>Admin test</Text>
            <Text style={styles.adminBannerText}>
              This shop stays usable so you can unlock perks the same way a user would. Use Admin to
              set the credit balance, then come back here.
            </Text>
            <TouchableOpacity
              style={styles.adminBtn}
              onPress={() => navigation.navigate('Admin', { focus: 'credits' })}
            >
              <Text style={styles.adminBtnText}>Edit credits in Admin</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.balance}>
          <Text style={styles.balanceNum}>{credits}</Text>
          <Text style={styles.balanceLabel}>credits on this account</Text>
          <View style={styles.balanceActions}>
            {staff ? (
              <TouchableOpacity
                style={[styles.needBtn, styles.needBtnGhost]}
                onPress={() => navigation.navigate('Admin', { focus: 'credits' })}
              >
                <Text style={styles.needBtnGhostText}>Admin: edit credits</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.needBtn} onPress={needMore}>
              <Text style={styles.needBtnText}>{staff ? 'Need more?' : 'Buy credits'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {owned.length ? (
          <Text style={styles.ownedLine}>Unlocked: {owned.join(' · ')}</Text>
        ) : (
          <Text style={styles.ownedLine}>No perks unlocked yet.</Text>
        )}

        {SHOP_ITEMS.map((item) => {
          const mine = hasPerk(rewards, item.perk);
          const can = !mine && credits >= item.cost;
          return (
            <View key={item.id} style={styles.card}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemBlurb}>{item.blurb}</Text>
              <Text style={styles.itemCost}>{item.cost} credits</Text>
              <TouchableOpacity
                style={[styles.button, mine && styles.buttonOwned, !mine && !can && styles.buttonOff]}
                onPress={() => (can || mine ? buy(item) : needMore())}
                disabled={mine || busyId === item.id}
              >
                <Text style={styles.buttonText}>
                  {mine
                    ? 'Unlocked'
                    : busyId === item.id
                      ? 'Unlocking…'
                      : can
                        ? 'Unlock'
                        : staff
                          ? 'Need more credits'
                          : 'Need more credits · Buy'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  content: { padding: 20, paddingBottom: 110 },
  kicker: {
    color: c.blueSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heading: { color: c.text, fontSize: 28, fontWeight: '800', marginTop: 4 },
  intro: { color: c.faint, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  adminBanner: {
    backgroundColor: '#1e1b4b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.spine,
    padding: 14,
    marginBottom: 14,
  },
  adminBannerTitle: { color: '#ddd6fe', fontWeight: '800', fontSize: 13, textTransform: 'uppercase' },
  adminBannerText: { color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  adminBtn: {
    marginTop: 10,
    backgroundColor: c.spine,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  adminBtnText: { color: '#fff', fontWeight: '800' },
  balance: {
    backgroundColor: c.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.spine,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  balanceNum: { color: c.muted, fontSize: 36, fontWeight: '800' },
  balanceLabel: { color: c.faint, fontSize: 13, marginTop: 4 },
  needBtn: {
    marginTop: 12,
    backgroundColor: c.blue,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  needBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: c.spine,
  },
  needBtnText: { color: '#fff', fontWeight: '700' },
  needBtnGhostText: { color: c.muted, fontWeight: '700' },
  balanceActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  ownedLine: { color: c.muted, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  card: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: c.cardBorder,
    marginBottom: 10,
  },
  itemTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
  itemBlurb: { color: c.faint, fontSize: 13, lineHeight: 18, marginTop: 4 },
  itemCost: { color: c.muted, fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  button: {
    backgroundColor: c.blue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonOwned: { backgroundColor: '#166534' },
  buttonOff: { backgroundColor: '#334155' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
}

