import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import HomeFab from '../components/HomeFab';
import { useTheme } from '../themeContext';

export default function UtilitiesScreen({ navigation }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.kicker, { color: colors.blueSoft }]}>Home</Text>
        <Text style={[styles.title, { color: colors.text }]}>Utilities</Text>
        <Text style={[styles.intro, { color: colors.faint }]}>
          Connection checks and tools that are not events. More can live here later.
        </Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue }]}
          onPress={() => navigation.navigate('StarlinkCheck')}
        >
          <Text style={styles.buttonText}>Starlink check</Text>
        </TouchableOpacity>
        <Text style={[styles.hint, { color: colors.muted }]}>
          Whether this device is on Starlink (public IP ASN) and optional dish at 192.168.100.1.
        </Text>
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  container: {
    padding: 24,
    paddingBottom: 100,
    alignItems: 'center',
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 320,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 8,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 320,
  },
});
