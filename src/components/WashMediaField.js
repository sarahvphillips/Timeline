import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, Modal, Pressable } from 'react-native';
import { isCameraAvailable, pickWashFromSource } from '../services/imagePicker';

export default function WashMediaField({
  imageUri,
  videoUri,
  onImage,
  onVideo,
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cameraOk = isCameraAvailable();

  const run = async (source) => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickWashFromSource(source);
      if (!picked || !picked.uri) return;
      if (picked.kind === 'video') onVideo(picked.uri);
      else onImage(picked.uri);
      setSheetOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>While loading</Text>
      <Text style={styles.hint}>Photo or video stays on this device — not uploaded to Firestore.</Text>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
      ) : null}
      {videoUri ? (
        <View style={styles.videoBox}>
          <Text style={styles.videoText}>Video saved on this device</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={() => setSheetOpen(true)} activeOpacity={0.8}>
          <Text style={styles.btnText}>
            {imageUri || videoUri ? 'Change media' : 'Add photo or video'}
          </Text>
        </TouchableOpacity>
        {imageUri ? (
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => onImage('')}>
            <Text style={styles.ghostText}>Remove photo</Text>
          </TouchableOpacity>
        ) : null}
        {videoUri ? (
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => onVideo('')}>
            <Text style={styles.ghostText}>Remove video</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Wash media</Text>
            {cameraOk ? (
              <TouchableOpacity style={styles.item} onPress={() => run('camera')} disabled={busy}>
                <Text style={styles.itemText}>Take photo</Text>
              </TouchableOpacity>
            ) : null}
            {cameraOk && Platform.OS !== 'web' ? (
              <TouchableOpacity style={styles.item} onPress={() => run('video')} disabled={busy}>
                <Text style={styles.itemText}>Record video</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.item} onPress={() => run('gallery')} disabled={busy}>
              <Text style={styles.itemText}>Choose from gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.item} onPress={() => run('file')} disabled={busy}>
              <Text style={styles.itemText}>Choose file</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={() => setSheetOpen(false)}>
              <Text style={styles.cancelText}>{busy ? 'Working…' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  label: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
    letterSpacing: 0.3,
  },
  hint: { color: '#64748b', fontSize: 12, marginBottom: 8, lineHeight: 16 },
  thumb: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#1a1b36', marginBottom: 8 },
  videoBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1a1b36',
    padding: 16,
    marginBottom: 8,
  },
  videoText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    backgroundColor: '#312e81',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  btnText: { color: '#c4b5fd', fontWeight: '600' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#475569' },
  ghostText: { color: '#94a3b8', fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#16182e',
    padding: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  item: { paddingVertical: 14 },
  itemText: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  cancel: { paddingVertical: 14, marginTop: 4 },
  cancelText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
});
