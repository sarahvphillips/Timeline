import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import ImageSourceSheet, { openImageSourcePicker } from '../components/ImageSourceSheet';
import { MenuCard, MenuRow, MenuSection } from '../components/MenuGroup';
import StampsRow from '../components/StampsRow';
import { useTheme } from '../themeContext';
import { getProfilePhotoUri, saveProfilePhotoUri } from '../services/profileService';
import { getEvents } from '../services/eventService';
import { loadAdmin, isBlocked, canSeeHomeAddEvent, canSeeHomeAdmin } from '../services/adminService';
import { syncAcceptedJoins } from '../services/peopleService';
import { getWordNumbers } from '../services/wordToIntService';
import {
  evaluateStamps,
  applyStampRowReward,
  applyJoinRewards,
  getRewards,
  STAMPS,
  CREDITS_PAUSED,
} from '../services/rewardsService';

function isHobby(event) {
  const source = String(event?.source || '').toLowerCase();
  const category = String(event?.category || '').toLowerCase();
  return !!(event?.hobbyType || source === 'hobby' || category === 'hobby');
}

function isCardSpend(event) {
  const source = String(event?.source || '').toLowerCase();
  const category = String(event?.category || '').toLowerCase();
  return source === 'bank' || source === 'purchase' || /credit|bank|purchase/.test(category);
}

export default function HomeScreen({ navigation, user, onLogout }) {
  const { colors, scheme, setMode } = useTheme();
  const guest = !!(user?.isGuest || user?.uid === 'guest-local');
  const initial = (user?.email || (guest ? 'G' : 'S')).charAt(0).toUpperCase();
  const [photoUri, setPhotoUri] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(true);
  const [staff, setStaff] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [stamps, setStamps] = useState(() => STAMPS.map((s) => ({ ...s, earned: false })));
  const [credits, setCredits] = useState(0);
  const [hobbyCount, setHobbyCount] = useState(0);
  const [cardCount, setCardCount] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Home',
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setMode(scheme === 'dark' ? 'light' : 'dark')}
          accessibilityLabel="Toggle light or dark"
          style={{ paddingHorizontal: 12 }}
        >
          <Ionicons name={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, scheme, colors.text, setMode]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        let events = [];
        let people = [];
        let words = [];
        try {
          events = await getEvents();
        } catch {
          events = [];
        }
        try {
          people = await syncAcceptedJoins();
        } catch {
          people = [];
        }
        try {
          words = await getWordNumbers();
        } catch {
          words = [];
        }
        if (cancelled) return;
        setHobbyCount(events.filter(isHobby).length);
        setCardCount(events.filter(isCardSpend).length);
        try {
          await applyJoinRewards(people);
        } catch {
          /* optional */
        }
        const nextStamps = evaluateStamps({ events, people, words });
        if (!cancelled) setStamps(nextStamps);
        try {
          const stampResult = await applyStampRowReward(nextStamps);
          const rewards = stampResult.rewards || (await getRewards());
          if (cancelled) return;
          setCredits(rewards.credits || 0);
          if (stampResult.newlyClaimed?.length) {
            Alert.alert(
              'Stamps',
              CREDITS_PAUSED
                ? stampResult.newlyClaimed[0].label
                : `${stampResult.newlyClaimed[0].label}. Open Credits shop to spend them.`
            );
          }
        } catch {
          try {
            const rewards = await getRewards();
            if (!cancelled) setCredits(rewards.credits || 0);
          } catch {
            /* keep defaults */
          }
        }
      })();
      loadAdmin(user?.email)
        .then((s) => {
          if (cancelled) return;
          const email = user?.email;
          setBlocked(isBlocked(email, s));
          setShowAddEvent(canSeeHomeAddEvent(email, s));
          setStaff(canSeeHomeAdmin(email, s));
        })
        .catch(() => {
          if (!cancelled) {
            setBlocked(false);
            setShowAddEvent(true);
            setStaff(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [user?.email])
  );

  useEffect(() => {
    let cancelled = false;
    getProfilePhotoUri()
      .then((uri) => {
        if (!cancelled && uri) setPhotoUri(uri);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const savePhoto = async (picked) => {
    if (!picked || !picked.uri) return;
    try {
      await saveProfilePhotoUri(picked.uri);
      setPhotoUri(picked.uri);
    } catch {
      Alert.alert('Could not save photo', 'Please try again.');
    }
  };

  const removePhoto = async () => {
    try {
      await saveProfilePhotoUri(null);
    } catch (_) {}
    setPhotoUri(null);
  };

  const handlePhoto = () => {
    const usedNative = openImageSourcePicker({
      title: 'Profile photo',
      onPicked: savePhoto,
      showRemove: !!photoUri,
      onRemove: removePhoto,
    });
    if (!usedNative) setSheetOpen(true);
  };

  const stampEarned = stamps.filter((s) => s.earned).length;

  if (blocked) {
    return (
      <View style={[styles.container, { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }]}>
        <Text style={[styles.brand, { color: colors.text }]}>Timeline</Text>
        <Text style={{ color: colors.faint, marginTop: 12, textAlign: 'center' }}>
          This email is blocked. Only the owner can unblock it from Admin.
        </Text>
        <TouchableOpacity style={{ marginTop: 24 }} onPress={onLogout}>
          <Text style={{ color: colors.faint }}>Log out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.profileRow}>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: colors.card, borderColor: colors.blue }]}
            onPress={handlePhoto}
            activeOpacity={0.8}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: colors.blueSoft }]}>{initial}</Text>
            )}
          </TouchableOpacity>
          <View style={styles.profileCopy}>
            <Text style={[styles.brand, { color: colors.text }]}>Timeline</Text>
            <Text style={[styles.email, { color: colors.faint }]} numberOfLines={1}>
              {guest ? 'Guest · this device only' : user?.email || 'Signed in'}
            </Text>
          </View>
        </View>

        {showAddEvent ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.blue }]}
            onPress={() => navigation.navigate('AddEvent')}
          >
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.addText}>Add event</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{hobbyCount}</Text>
            <Text style={[styles.statLabel, { color: colors.faint }]}>Hobby</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{cardCount}</Text>
            <Text style={[styles.statLabel, { color: colors.faint }]}>Purchases</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{stampEarned}</Text>
            <Text style={[styles.statLabel, { color: colors.faint }]}>Stamps</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>STAMPS</Text>
        <StampsRow
          stamps={stamps}
          credits={credits}
          colors={colors}
          onShop={() => navigation.navigate(CREDITS_PAUSED ? 'CreditFeedback' : 'CreditsShop')}
          onStamp={(s) => s?.screen && navigation.navigate(s.screen)}
        />

        {guest ? (
          <Text style={[styles.guestNote, { color: colors.muted }]}>
            Guest mode keeps events on this device. Create an account when you want a backup and friends features.
          </Text>
        ) : null}

        <MenuSection title="BROWSE">
          <MenuCard colors={colors}>
            <MenuRow
              colors={colors}
              icon="time-outline"
              label="Timeline"
              onPress={() => navigation.navigate('YearOverview')}
            />
            <MenuRow
              colors={colors}
              icon="people-outline"
              label="Events with friends"
              last
              onPress={() =>
                guest
                  ? Alert.alert('Create an account for this', 'Friends needs a signed-in Timeline account.')
                  : navigation.navigate('EventsWithFriends')
              }
            />
          </MenuCard>
        </MenuSection>

        <MenuSection title="ACCOUNT">
          <MenuCard colors={colors}>
            {staff ? (
              <MenuRow colors={colors} icon="shield-outline" label="Admin" onPress={() => navigation.navigate('Admin')} />
            ) : null}
            <MenuRow
              colors={colors}
              icon="ticket-outline"
              label="Enter invite code"
              onPress={() =>
                guest
                  ? Alert.alert('Create an account for this', 'Invite codes need a signed-in Timeline account.')
                  : navigation.navigate('AcceptInvite')
              }
            />
            <MenuRow
              colors={colors}
              icon="construct-outline"
              label="Utilities"
              onPress={() => navigation.navigate('Utilities')}
            />
            <MenuRow
              colors={colors}
              icon="settings-outline"
              label="Settings"
              last
              onPress={() => navigation.navigate('Settings')}
            />
          </MenuCard>
        </MenuSection>

        <MenuSection title="MORE">
          <MenuCard colors={colors}>
            {guest ? (
              <MenuRow
                colors={colors}
                icon="person-add-outline"
                label="Create an account"
                onPress={onLogout}
              />
            ) : (
              <MenuRow
                colors={colors}
                icon="person-add-outline"
                label="Add another account"
                onPress={() =>
                  Alert.alert(
                    'Add another account',
                    'Multi-account sign-in will be added later. For now you can log out and sign in with a different email.'
                  )
                }
              />
            )}
            <MenuRow
              colors={colors}
              icon="log-out-outline"
              label={guest ? 'Leave guest mode' : 'Log out'}
              last
              danger
              onPress={onLogout}
            />
          </MenuCard>
        </MenuSection>

        {Platform.OS === 'web' ? (
          <ImageSourceSheet
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            onPicked={savePhoto}
            showRemove={!!photoUri}
            onRemove={removePhoto}
            title="Profile photo"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  profileCopy: { flex: 1 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { fontSize: 20, fontWeight: '700' },
  brand: { fontSize: 22, fontWeight: '800' },
  email: { fontSize: 13, marginTop: 2 },
  addBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  addText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  sectionTitle: {
    color: '#7c6ee6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  guestNote: { fontSize: 13, lineHeight: 18, marginTop: 8 },
});
