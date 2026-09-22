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
          Connection checks and tools that are not events.
        </Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue }]}
          onPress={() => navigation.navigate('DateCircle')}
        >
          <Text style={styles.buttonText}>Date circle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue }]}
          onPress={() => navigation.navigate('DateSpan')}
        >
          <Text style={styles.buttonText}>Days between dates</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue }]}
          onPress={() => navigation.navigate('PeopleDateGraph')}
        >
          <Text style={styles.buttonText}>People and dates graph</Text>
        </TouchableOpacity>
        <Text style={[styles.hint, { color: colors.muted }]}>
          People and saved day-counts on one graph. Turn both on to see where a day-count matches two birthdays.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue }]}
          onPress={() => navigation.navigate('WordToInt')}
        >
          <Text style={styles.buttonText}>Word to int</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue }]}
          onPress={() => navigation.navigate('WordGraph')}
        >
          <Text style={styles.buttonText}>Word graph</Text>
        </TouchableOpacity>
        <Text style={[styles.hint, { color: colors.muted }]}>
          Words that share a number, laid out like a network.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue }]}
          onPress={() => navigation.navigate('YearOverview')}
        >
          <Text style={styles.buttonText}>Checksums</Text>
        </TouchableOpacity>
        <Text style={[styles.hint, { color: colors.muted }]}>
          Event SHA-256 lives on each item. Timeline is the shortcut until a dedicated checksums list is added.
        </Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.blue, marginTop: 16 }]}
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
