import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import { lookupPublicProfile, normalizeHandle } from '../services/profileService';
import { savePerson } from '../services/peopleService';
import { auth } from '../services/firebase';

export default function PublicProfileScreen({ navigation, route }) {
  const incoming = normalizeHandle(route?.params?.handle || '');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setLoading(true);
      lookupPublicProfile(incoming)
        .then((row) => {
          if (!live) return;
          setProfile(row);
          setError(row ? '' : 'This profile is private, or that handle does not exist.');
        })
        .catch((e) => {
          if (!live) return;
          setProfile(null);
          setError(e?.message || 'Could not load this profile.');
        })
        .finally(() => {
          if (live) setLoading(false);
        });
      return () => {
        live = false;
      };
    }, [incoming])
  );

  const addPerson = async () => {
    if (!profile) return;
    if (profile.uid === auth.currentUser?.uid) {
      Alert.alert('That is you', 'This is your public profile.');
      return;
    }
    try {
      await savePerson({
        name: profile.displayName || profile.handle,
        note: `Public profile @${profile.handle}`,
        linkedUid: profile.uid,
      });
      Alert.alert('Added', `${profile.displayName || profile.handle} is on your People list.`);
      navigation.navigate('People');
    } catch (e) {
      Alert.alert(
        e?.code === 'DUPLICATE_PERSON' ? 'Already listed' : 'Could not add',
        e?.message || 'Try again.',
      );
    }
  };

  return (
    <View style={styles.wrap}>
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" />
      ) : profile ? (
        <>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile.displayName || profile.handle || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{profile.displayName || profile.handle}</Text>
          <Text style={styles.handle}>@{profile.handle}</Text>
          <Text style={styles.meta}>Public on Timeline · not a friend yet</Text>
          <TouchableOpacity style={styles.button} onPress={addPerson}>
            <Text style={styles.buttonText}>Add to People</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.name}>Not available</Text>
          <Text style={styles.meta}>{error}</Text>
        </>
      )}
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0f1024',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  name: { color: '#f8fafc', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  handle: { color: '#c4b5fd', fontSize: 16, fontWeight: '700', marginTop: 4 },
  meta: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  button: {
    marginTop: 20,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
