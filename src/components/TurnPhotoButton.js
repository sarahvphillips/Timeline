import React from 'react';
import { Alert, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { asImageUri, quarterTurn } from '../services/imagePicker';

/** One tap adds 90 degrees. The photo file stays as it is; the screen turns it. Tap again if it is still upside down. */
export default function TurnPhotoButton({ uri, turn = 0, onTurned, label = 'Turn' }) {
  if (uri != null && uri !== '' && !asImageUri(uri)) return null;

  const press = () => {
    const next = quarterTurn(turn);
    Promise.resolve(onTurned && onTurned(next)).catch((e) => {
      Alert.alert('Could not turn photo', e?.message || 'Try again.');
    });
  };

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={press}
      accessibilityLabel="Turn photo"
      activeOpacity={0.8}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
  },
  text: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
});
