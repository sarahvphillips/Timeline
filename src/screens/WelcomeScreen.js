import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import { copyTextToClipboard } from '../services/shareService';
import { buildWelcomeEmail, welcomePendingKey } from '../legal/welcomeEmail';

export default function WelcomeScreen({ navigation, route, onFinished }) {
  const user = auth.currentUser;
  const letter = useMemo(
    () =>
      buildWelcomeEmail({
        displayName: user?.displayName || '',
        email: user?.email || '',
      }),
    [user?.displayName, user?.email],
  );
  const [copied, setCopied] = useState(false);
  const fromSettings = route?.params?.fromSettings === true;

  const continueOn = async () => {
    const uid = user?.uid;
    if (fromSettings) {
      navigation.goBack();
      return;
    }
    if (uid) {
      try {
        await AsyncStorage.removeItem(welcomePendingKey(uid));
      } catch (_) {}
    }
    if (typeof onFinished === 'function') onFinished();
  };

  const copy = async () => {
    const ok = await copyTextToClipboard(letter.text);
    setCopied(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(ok ? 'Copied the welcome email.' : letter.text);
      return;
    }
    Alert.alert(ok ? 'Copied' : 'Welcome email', ok ? 'Paste into Gmail if you want a copy in your inbox.' : letter.text);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>A letter from Sarah</Text>
        <Text style={styles.subject}>{letter.subject}</Text>
        <Text style={styles.meta}>From {letter.from}</Text>
        {letter.sections.map((block, i) =>
          block.type === 'poem' ? (
            <View key="poem" style={styles.poemBox}>
              <Text style={styles.poemKicker}>A poem for Timeline</Text>
              <Text style={styles.poem}>{block.text}</Text>
            </View>
          ) : (
            <Text key={`p-${i}`} style={styles.body}>
              {block.text}
            </Text>
          ),
        )}
        <TouchableOpacity style={styles.primary} onPress={continueOn}>
          <Text style={styles.primaryText}>{fromSettings ? 'Back to Settings' : 'Start Timeline'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghost} onPress={copy}>
          <Text style={styles.ghostText}>{copied ? 'Copied' : 'Copy email text'}</Text>
        </TouchableOpacity>
        <Text style={styles.fine}>
          Firebase cannot send this as a real inbox email on the free plan. This is the welcome you
          see in the app. Copy puts the same words on the clipboard if you want them in Gmail.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 22, paddingBottom: 48 },
  kicker: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subject: { color: '#f8fafc', fontSize: 24, fontWeight: '800', marginTop: 8, lineHeight: 30 },
  meta: { color: '#94a3b8', fontSize: 13, marginTop: 8, marginBottom: 18 },
  body: { color: '#e2e8f0', fontSize: 16, lineHeight: 24, marginBottom: 14 },
  poemBox: {
    borderLeftWidth: 2,
    borderLeftColor: '#c4b5fd',
    paddingLeft: 14,
    marginBottom: 18,
    marginTop: 4,
  },
  poemKicker: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  poem: {
    color: '#f1f5f9',
    fontSize: 16,
    lineHeight: 26,
    fontStyle: 'italic',
  },
  primary: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: 14, alignItems: 'center' },
  ghostText: { color: '#93c5fd', fontWeight: '700' },
  fine: { color: '#64748b', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
});
