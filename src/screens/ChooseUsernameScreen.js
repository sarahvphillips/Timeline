import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getProfile, normalizeHandle, saveProfile, suggestFreeHandle } from '../services/profileService';
import { useTheme } from '../themeContext';

export default function ChooseUsernameScreen({ onChosen, onSignOut }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const takenNames = useRef(new Set());

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((profile) => {
        if (!alive) return;
        if (normalizeHandle(profile?.handle).length >= 3) onChosen();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    const chosen = normalizeHandle(username);
    if (chosen.length < 3) {
      setError('Choose a username of at least 3 letters or numbers. It cannot be changed later.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveProfile({ handle: chosen, visibility: 'private' });
      onChosen();
    } catch (e) {
      const code = e?.code || '';
      if (code === 'HANDLE_TAKEN') {
        takenNames.current.add(chosen);
        setError('That username is already in use. Try another.');
        if (takenNames.current.size >= 5) {
          const idea = await suggestFreeHandle(chosen);
          setSuggestion(idea || '');
          if (!idea) setError('Those usernames are taken, and no free variation was found. Try a different word.');
        }
      } else {
        setError(e?.message || 'Could not save that username.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Choose a username</Text>
        <Text style={styles.body}>
          Friends see this instead of your email. Letters and numbers only. It cannot be changed later.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={(value) => {
            setUsername(normalizeHandle(value));
            if (error) setError('');
          }}
          editable={!saving}
          onSubmitEditing={save}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {suggestion ? (
          <TouchableOpacity
            style={styles.suggest}
            onPress={() => {
              setUsername(suggestion);
              setError('');
            }}
            disabled={saving}
          >
            <Text style={styles.suggestText}>Try @{suggestion}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save username</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOut} onPress={onSignOut} disabled={saving}>
          <Text style={styles.signOutText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      backgroundColor: c.card,
      borderColor: c.cardBorder,
      borderWidth: 1,
      borderRadius: 16,
      padding: 22,
    },
    title: { color: c.text, fontSize: 24, fontWeight: '700', marginBottom: 8 },
    body: { color: c.muted || c.faint, fontSize: 15, lineHeight: 22, marginBottom: 16 },
    input: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.bg,
      color: c.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
    },
    error: { color: c.danger || '#dc2626', marginTop: 10, fontSize: 14 },
    suggest: {
      marginTop: 12,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: c.blue,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    suggestText: { color: c.blue, fontSize: 15, fontWeight: '700' },
    button: {
      backgroundColor: c.blue,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    signOut: { marginTop: 16, alignItems: 'center' },
    signOutText: { color: c.blueSoft || c.blue, fontSize: 14 },
  });
}
