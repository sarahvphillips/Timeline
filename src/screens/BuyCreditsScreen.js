import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import HomeFab from '../components/HomeFab';
import { CREDIT_PACKS } from '../services/rewardsService';

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(title + (message ? `\n\n${message}` : ''));
    return;
  }
  Alert.alert(title, message);
}

export default function BuyCreditsScreen({ navigation }) {
  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Credits shop</Text>
        <Text style={styles.heading}>Buy credits</Text>
        <Text style={styles.intro}>
          Credits are also earned when friends join Timeline and when you fill the stamps row. Buying
          packs will use the Play Store (or App Store) when Timeline is published — it is not charging
          yet.
        </Text>
        {CREDIT_PACKS.map((pack) => (
          <View key={pack.id} style={styles.card}>
            <Text style={styles.title}>{pack.credits} credits</Text>
            <Text style={styles.blurb}>{pack.blurb}</Text>
            <Text style={styles.price}>{pack.priceLabel}</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() =>
                notify(
                  'Not for sale yet',
                  `${pack.credits} credits (${pack.priceLabel}) will be a store purchase. Nothing is taken from your account now.`,
                )
              }
            >
              <Text style={styles.buttonText}>Buy {pack.priceLabel}</Text>
            </TouchableOpacity>
          </View>
        ))}
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
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2b4a',
    marginBottom: 10,
  },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  blurb: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  price: { color: '#c4b5fd', fontSize: 16, fontWeight: '800', marginTop: 8, marginBottom: 10 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { color: '#7dd3fc', fontWeight: '700', marginTop: 8, textAlign: 'center' },
});
