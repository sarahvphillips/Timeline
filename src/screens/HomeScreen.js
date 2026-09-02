import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';

export default function HomeScreen({ navigation, user, onLogout }) {
  const initial = (user?.email || 'S').charAt(0).toUpperCase();

  const handleAddAccount = () => {
    Alert.alert(
      'Add another account',
      'Multi-account sign-in will be added later. For now you can log out and sign in with a different email.'
    );
  };

  const handleSettings = () => {
    Alert.alert(
      'Settings',
      'Settings (theme, poem categories, labels) will live here. Not built in this test build yet.'
    );
  };

  const handleShare = () => {
    Alert.alert(
      'Share with another Timeline user',
      'You will be able to invite someone who also has Timeline and share your timeline (or chosen years/events) with them. This is not connected yet.'
    );
  };

  const handlePhoto = () => {
    Alert.alert(
      'Profile photo',
      'You will be able to choose a photo from your gallery, Google Drive, or other files on this device. Not connected in this test build yet.'
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profile}>
        <TouchableOpacity style={styles.avatar} onPress={handlePhoto} activeOpacity={0.8}>
          <Text style={styles.avatarText}>{initial}</Text>
        </TouchableOpacity>
        <Text style={styles.photoHint}>Profile photo</Text>
        <Text style={styles.title}>Timeline</Text>
        <Text style={styles.email}>{user?.email || 'Signed in'}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('YearOverview')}>
        <Text style={styles.buttonText}>Timeline</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('AddEvent', { fromEmail: true, source: 'email' })}
      >
        <Text style={styles.buttonText}>Add from email</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('StarlinkCheck')}>
        <Text style={styles.buttonText}>Starlink check</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('WordToInt')}>
        <Text style={styles.buttonText}>Word to Int</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('DateSpan')}>
        <Text style={styles.buttonText}>Days between dates</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.ghost]} onPress={handleShare}>
        <Text style={styles.ghostText}>Share with another user</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.ghost]} onPress={handleSettings}>
        <Text style={styles.ghostText}>Settings</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.ghost]} onPress={handleAddAccount}>
        <Text style={styles.ghostText}>Add another account</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.ghost]} onPress={onLogout}>
        <Text style={styles.ghostText}>Log out</Text>
      </TouchableOpacity>
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
    marginBottom: 32,
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
