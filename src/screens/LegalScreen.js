import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import HomeFab from '../components/HomeFab';
import {
  PRIVACY_META,
  PRIVACY_SECTIONS,
  MANUAL_META,
  MANUAL_SECTIONS,
} from '../legal/docs';

export default function LegalScreen({ navigation, route }) {
  const which = route?.params?.doc === 'manual' ? 'manual' : 'privacy';
  const meta = which === 'manual' ? MANUAL_META : PRIVACY_META;
  const sections = which === 'manual' ? MANUAL_SECTIONS : PRIVACY_SECTIONS;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{which === 'manual' ? 'Help' : 'Legal'}</Text>
        <Text style={styles.heading}>{meta.title}</Text>
        <Text style={styles.meta}>
          Version {meta.version} · Updated {meta.updated}
        </Text>
        {sections.map((s) => (
          <View key={s.heading} style={styles.block}>
            <Text style={styles.h}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1024' },
  content: { padding: 20, paddingBottom: 110 },
  kicker: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heading: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  meta: { color: '#64748b', fontSize: 13, marginTop: 6, marginBottom: 16 },
  block: { marginBottom: 18 },
  h: { color: '#e2e8f0', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  body: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
});
