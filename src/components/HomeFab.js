import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function HomeFab({ navigation, besidePlus = true }) {
  if (!navigation) return null;
  return (
    <TouchableOpacity
      style={[styles.fab, { right: besidePlus ? 92 : 24 }]}
      onPress={() =>
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        })
      }
      accessibilityLabel="Back to Home"
    >
      <Text style={styles.text}>⌂</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 32,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#3b0764',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  text: {
    color: '#c4b5fd',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
});
