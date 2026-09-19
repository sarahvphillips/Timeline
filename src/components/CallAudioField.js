import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

function audioApi() {
  try {
    return require('expo-av').Audio;
  } catch {
    return null;
  }
}

export default function CallAudioField({ audioUri, audioName, onChange }) {
  const [recording, setRecording] = useState(null);
  const [busy, setBusy] = useState(false);

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(title + (message ? `\n\n${message}` : ''));
      return;
    }
    Alert.alert(title, message);
  };

  const attachFile = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/3gpp'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const file = res.assets[0];
      onChange({ uri: file.uri, name: file.name || 'call-audio' });
    } catch (e) {
      notify('Audio', e?.message || 'Could not attach a file.');
    } finally {
      setBusy(false);
    }
  };

  const startMemo = async () => {
    const Audio = audioApi();
    if (!Audio) {
      notify(
        'In-app record',
        'Needs expo-av on this install. You can still attach a file from Voice Recorder or a call recording the phone already saved.'
      );
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        notify('Microphone', 'Allow the mic to record a voice note about the call.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
    } catch (e) {
      notify('Record', e?.message || 'Could not start recording.');
    }
  };

  const stopMemo = async () => {
    const rec = recording;
    setRecording(null);
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (uri) onChange({ uri, name: 'voice-note.m4a' });
    } catch (e) {
      notify('Record', e?.message || 'Could not save the voice note.');
    }
  };

  const play = async () => {
    const Audio = audioApi();
    if (!Audio || !audioUri) {
      notify('Playback', 'Audio is saved on this device. Play it in Files / Voice Recorder if in-app play is unavailable.');
      return;
    }
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      await sound.playAsync();
    } catch (e) {
      notify('Playback', e?.message || 'Could not play this file.');
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Call recording</Text>
      <Text style={styles.hint}>
        Timeline cannot tap the live phone line. Attach a recording the phone already saved, or record a
        voice note here. Stays on this device — not uploaded to Firestore.
      </Text>
      {audioUri ? (
        <Text style={styles.file}>{audioName || 'Audio saved on this device'}</Text>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={attachFile} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Working…' : audioUri ? 'Change file' : 'Attach audio'}</Text>
        </TouchableOpacity>
        {recording ? (
          <TouchableOpacity style={[styles.btn, styles.stop]} onPress={stopMemo}>
            <Text style={styles.btnText}>Stop</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={startMemo}>
            <Text style={styles.btnText}>Record note</Text>
          </TouchableOpacity>
        )}
      </View>
      {audioUri ? (
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={play}>
            <Text style={styles.ghostText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => onChange({ uri: '', name: '' })}>
            <Text style={styles.ghostText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  label: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  file: { color: '#86efac', fontSize: 13, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  btn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  stop: { backgroundColor: '#b91c1c' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#475569' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghostText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
});
