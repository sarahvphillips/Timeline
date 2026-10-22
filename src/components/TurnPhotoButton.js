import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { asImageUri, rotateImageQuarter } from '../services/imagePicker';

/** One tap turns the photo 90 degrees clockwise. Tap again if it is still the wrong way up. */
export default function TurnPhotoButton({ uri, onTurned, label = 'Turn' }) {
  const [busy, setBusy] = useState(false);
  const src = asImageUri(uri);
  if (!src) return null;

  const press = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await rotateImageQuarter(src);
      if (!next) {
        Alert.alert('Could not turn photo', 'Try again.');
        return;
      }
      await onTurned(next);
    } catch (e) {
      Alert.alert('Could not turn photo', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={press}
      disabled={busy}
      accessibilityLabel="Turn photo"
      activeOpacity={0.8}
    >
      <Text style={styles.text}>{busy ? 'Turning…' : label}</Text>
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
