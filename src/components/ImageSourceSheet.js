import React, { useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { isCameraAvailable, pickFromSource, promptImageSourceNative } from '../services/imagePicker';

/**
 * Bottom sheet: Take photo / Gallery / File / Cancel.
 * On native, Alert buttons are used (true action sheet / dialog).
 * On web, this modal is required because Alert cannot show multiple buttons.
 */
export function openImageSourcePicker({ onPicked, showRemove, onRemove, title }) {
  if (promptImageSourceNative({ onPicked, showRemove, onRemove, title })) {
    return true;
  }
  return false;
}

export default function ImageSourceSheet({
  visible,
  onClose,
  onPicked,
  showRemove,
  onRemove,
  title = 'Add photo',
}) {
  const [busy, setBusy] = useState(false);
  const cameraOk = isCameraAvailable();

  const run = async (source) => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickFromSource(source);
      if (picked) {
        onPicked(picked);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (onRemove) onRemove();
    onClose();
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>
            {Platform.OS === 'android'
              ? 'Google Photos appears in the system gallery picker.'
              : 'Choose a photo from camera, gallery, or files.'}
          </Text>
          {cameraOk ? (
            <TouchableOpacity style={styles.item} onPress={() => run('camera')} disabled={busy}>
              <Text style={styles.itemText}>Take photo</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.item} onPress={() => run('gallery')} disabled={busy}>
            <Text style={styles.itemText}>Choose from gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.item} onPress={() => run('file')} disabled={busy}>
            <Text style={styles.itemText}>Choose file</Text>
          </TouchableOpacity>
          {showRemove ? (
            <TouchableOpacity style={styles.item} onPress={remove} disabled={busy}>
              <Text style={styles.removeText}>Remove photo</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={busy}>
            <Text style={styles.cancelText}>{busy ? 'Working?' : 'Cancel'}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1b36',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  hint: { color: '#94a3b8', fontSize: 13, marginBottom: 10 },
  item: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  itemText: { color: '#e2e8f0', fontSize: 16 },
  removeText: { color: '#f87171', fontSize: 16 },
  cancel: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#94a3b8', fontSize: 15 },
});
