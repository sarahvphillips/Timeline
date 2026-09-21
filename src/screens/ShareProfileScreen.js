import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Share,
  Platform,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HomeFab from '../components/HomeFab';
import { getProfile, profileShareText, normalizeHandle } from '../services/profileService';
import { buildProfileLink } from '../utils/inviteCode';
import { copyTextToClipboard, qrImageUrl } from '../services/shareService';

function smsHref(body) {
  const text = encodeURIComponent(body);
  return Platform.OS === 'ios' ? `sms:&body=${text}` : `sms:?body=${text}`;
}

export default function ShareProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getProfile().then(setProfile).catch(() => setProfile(null));
    }, [])
  );

  const publicOk = profile?.visibility === 'public' && normalizeHandle(profile.handle).length >= 3;
  const link = publicOk ? buildProfileLink(profile.handle) : '';
  const text = publicOk ? profileShareText(profile) : '';

  const openUrl = async (url) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(url, '_blank');
        return;
      }
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        Alert.alert('App not found', 'Try Copy or More.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open', 'Try Copy or More.');
    }
  };

  const copy = async () => {
    const ok = await copyTextToClipboard(text || link);
    setCopied(true);
    Alert.alert(ok ? 'Copied' : 'Share text', text || link);
  };

  const more = async () => {
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message: text, url: link || undefined }
          : { message: text, title: 'My Timeline profile' },
      );
    } catch (_) {}
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Share my profile</Text>
        {!publicOk ? (
          <Text style={styles.intro}>
            Your profile is private. In Settings, choose Searchable and pick a handle, then come back
            here for a link and QR you can post on social media.
          </Text>
        ) : (
          <>
            <Text style={styles.intro}>
              Anyone on Timeline can look you up as @{profile.handle} without adding you first. Private
              events stay private.
            </Text>
            <Text style={styles.handle}>@{profile.handle}</Text>
            <Text style={styles.link}>{link}</Text>
            {link ? (
              <Image source={{ uri: qrImageUrl(link, 200) }} style={styles.qr} />
            ) : null}
            <View style={styles.row}>
              <TouchableOpacity style={styles.chip} onPress={copy}>
                <Text style={styles.chipText}>{copied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chip}
                onPress={() =>
                  openUrl(
                    `mailto:?subject=${encodeURIComponent('Find me on Timeline')}&body=${encodeURIComponent(text)}`,
                  )
                }
              >
                <Text style={styles.chipText}>Gmail</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chip} onPress={() => openUrl(smsHref(text))}>
                <Text style={styles.chipText}>SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chip}
                onPress={() => openUrl(`https://wa.me/?text=${encodeURIComponent(text)}`)}
              >
                <Text style={styles.chipText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, styles.chipOn]} onPress={more}>
                <Text style={styles.chipTextOn}>More</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        <TouchableOpacity style={styles.ghost} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.ghostText}>Open Settings</Text>
        </TouchableOpacity>
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 110 },
  heading: { color: '#f8fafc', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  handle: { color: '#c4b5fd', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  link: { color: '#93c5fd', fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 12 },
  qr: { width: 200, height: 200, alignSelf: 'center', backgroundColor: '#fff', marginBottom: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#93c5fd', fontWeight: '700' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  ghost: { marginTop: 20, alignItems: 'center', paddingVertical: 12 },
  ghostText: { color: '#94a3b8', fontWeight: '700' },
});
