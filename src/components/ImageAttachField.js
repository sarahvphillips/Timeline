import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import ImageSourceSheet, { openImageSourcePicker } from './ImageSourceSheet';

export default function ImageAttachField({
  label,
  uri,
  onChange,
  caption,
  onCaptionChange,
  captionPlaceholder = 'Optional caption',
  hint,
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const handlePicked = (picked) => {
    if (picked && picked.uri) onChange(picked);
  };

  const openPicker = () => {
    const usedNative = openImageSourcePicker({
      title: label || 'Add photo',
      onPicked: handlePicked,
      showRemove: !!uri,
      onRemove: () => onChange(null),
    });
    if (!usedNative) setSheetOpen(true);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {uri ? (
        <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={openPicker} activeOpacity={0.8}>
          <Text style={styles.btnText}>{uri ? 'Change photo' : 'Add photo'}</Text>
        </TouchableOpacity>
        {uri ? (
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => onChange(null)}>
            <Text style={styles.ghostText}>Remove</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {typeof onCaptionChange === 'function' ? (
        <TextInput
          style={styles.input}
          placeholder={captionPlaceholder}
          placeholderTextColor="#64748b"
          value={caption || ''}
          onChangeText={onCaptionChange}
        />
      ) : null}
      {Platform.OS === 'web' ? (
        <ImageSourceSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onPicked={handlePicked}
          showRemove={!!uri}
          onRemove={() => onChange(null)}
          title={label || 'Add photo'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  label: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 18,
    letterSpacing: 0.3,
  },
  thumb: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#0f1024',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3b0764',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: {
    backgroundColor: '#312e81',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#3b82f6',
    alignItems: 'center',
  },
  btnText: { color: '#60a5fa', fontSize: 15, fontWeight: '600' },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: '#475569',
  },
  ghostText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6 },
  input: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b0764',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#f8fafc',
    marginTop: 8,
  },
});
