import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Platform } from 'react-native';
import ImageSourceSheet, { openImageSourcePicker } from '../components/ImageSourceSheet';
import {
  getOrCreateDeviceId,
  listSessions,
  otherRecentSessions,
} from '../services/deviceSession';
import { useTheme } from '../themeContext';
import { getProfilePhotoUri, saveProfilePhotoUri } from '../services/profileService';

function platformLabel(platform) {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  if (platform === 'web') return 'Web';
  return platform || 'Unknown';
}

function formatLastSeen(iso) {
  if (!iso) return 'unknown';
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return String(iso);
  }
}

export default function HomeScreen({ navigation, user, onLogout }) {
  const { colors } = useTheme();
  const initial = (user?.email || 'S').charAt(0).toUpperCase();
  const [photoUri, setPhotoUri] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [thisDeviceId, setThisDeviceId] = useState(null);
  const [sessions, setSessions] = useState([]);

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

  useEffect(() => {
    if (!user?.uid) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const id = await getOrCreateDeviceId();
        if (cancelled) return;
        setThisDeviceId(id);
        const listed = await listSessions(user.uid);
        if (cancelled) return;
        setSessions(listed);
      } catch (e) {
        console.warn('Could not load signed-in devices', e);
      }
    };

    load();
    const retry = setTimeout(load, 1200);
    return () => {
      cancelled = true;
      clearTimeout(retry);
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

  const handleAddAccount = () => {
    Alert.alert(
      'Add another account',
      'Multi-account sign-in will be added later. For now you can log out and sign in with a different email.'
    );
  };

  const handleSettings = () => {
    navigation.navigate('Settings');
  };


  const thisSession = sessions.find((s) => s.id === thisDeviceId);
  const otherSessions = sessions.filter((s) => s.id !== thisDeviceId);
  const recentOthers = otherRecentSessions(sessions, thisDeviceId);
  const otherCount = recentOthers.length;
  const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
  const newlyCreatedOther =
    sessions.length >= 2 &&
    otherSessions.some((s) => {
      const created = new Date(s.createdAt || 0).getTime();
      return Number.isFinite(created) && created >= fifteenMinAgo;
    });

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.profile}>
        <TouchableOpacity style={[styles.avatar, { backgroundColor: colors.card, borderColor: colors.blue }]} onPress={handlePhoto} activeOpacity={0.8}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarText, { color: colors.blueSoft }]}>{initial}</Text>
          )}
        </TouchableOpacity>
        <Text style={[styles.photoHint, { color: colors.muted }]}>{photoUri ? 'Tap to change photo' : 'Tap to add a profile photo'}</Text>
        <Text style={[styles.title, { color: colors.text }]}>Timeline</Text>
        <Text style={[styles.email, { color: colors.faint }]}>{user?.email || 'Signed in'}</Text>
      </View>

      <View style={[styles.devicesSection, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        <Text style={[styles.devicesTitle, { color: colors.muted }]}>Signed-in devices</Text>
        <View style={styles.deviceRow}>
          <Text style={[styles.deviceName, { color: colors.text }]}>
            {platformLabel(thisSession?.platform || Platform.OS)}
            <Text style={[styles.thisDevice, { color: colors.blueSoft }]}>  This device</Text>
          </Text>
          <Text style={[styles.deviceMeta, { color: colors.faint }]}>
            Last seen {formatLastSeen(thisSession?.lastSeen || new Date().toISOString())}
          </Text>
        </View>
        {otherSessions.map((s) => (
          <View key={s.id} style={styles.deviceRow}>
            <Text style={[styles.deviceName, { color: colors.text }]}>{platformLabel(s.platform)}</Text>
            <Text style={[styles.deviceMeta, { color: colors.faint }]}>Last seen {formatLastSeen(s.lastSeen)}</Text>
          </View>
        ))}
        {otherCount > 0 ? (
          <Text style={[styles.devicesNote, { color: colors.muted }]}>
            This account is also signed in on {otherCount} other device{otherCount === 1 ? '' : 's'}. Laptop and phone both count.
          </Text>
        ) : null}
        {newlyCreatedOther ? (
          <Text style={styles.devicesNew}>A new sign-in was recorded on another device in the last 15 minutes.</Text>
        ) : null}
      </View>

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.blue }]} onPress={() => navigation.navigate('YearOverview')}>
        <Text style={styles.buttonText}>Timeline</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.blue }]} onPress={() => navigation.navigate('EventsWithFriends')}>
        <Text style={styles.buttonText}>Events with friends</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.ghost, { backgroundColor: 'transparent', borderColor: colors.cardBorder }]}
        onPress={() => navigation.navigate('AcceptInvite')}
      >
        <Text style={[styles.ghostText, { color: colors.faint }]}>Enter invite code</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.blue }]}
        onPress={() => navigation.navigate('AddEvent', { fromEmail: true, source: 'email' })}
      >
        <Text style={styles.buttonText}>Add from email</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.blue }]} onPress={() => navigation.navigate('StarlinkCheck')}>
        <Text style={styles.buttonText}>Starlink check</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.blue }]} onPress={() => navigation.navigate('WordToInt')}>
        <Text style={styles.buttonText}>Word to Int</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.blue }]} onPress={() => navigation.navigate('DateSpan')}>
        <Text style={styles.buttonText}>Days between dates</Text>
      </TouchableOpacity>


      <TouchableOpacity style={[styles.button, styles.ghost, { backgroundColor: 'transparent', borderColor: colors.cardBorder }]} onPress={handleSettings}>
        <Text style={[styles.ghostText, { color: colors.faint }]}>Settings</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.ghost, { backgroundColor: 'transparent', borderColor: colors.cardBorder }]} onPress={handleAddAccount}>
        <Text style={[styles.ghostText, { color: colors.faint }]}>Add another account</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.ghost, { backgroundColor: 'transparent', borderColor: colors.cardBorder }]} onPress={onLogout}>
        <Text style={[styles.ghostText, { color: colors.faint }]}>Log out</Text>
      </TouchableOpacity>

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
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0f1024',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profile: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#312e81',
    borderWidth: 2,
    borderColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarText: {
    color: '#60a5fa',
    fontSize: 28,
    fontWeight: '700',
  },
  photoHint: {
    color: '#a5b4fc',
    fontSize: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f8fafc',
  },
  email: {
    color: '#94a3b8',
    marginTop: 6,
    textAlign: 'center',
  },
  devicesSection: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#16182e',
  },
  devicesTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  deviceRow: {
    marginBottom: 8,
  },
  deviceName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  thisDevice: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  deviceMeta: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  devicesNote: {
    color: '#a5b4fc',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
  devicesNew: {
    color: '#fbbf24',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 12,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#475569',
  },
  ghostText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
});