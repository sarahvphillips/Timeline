import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

function audioApi() {
  try {
    return require('expo-av').Audio;
  } catch {
    return null;
  }
}

function kindFromName(name = '', mime = '') {
  const blob = `${name} ${mime}`.toLowerCase();
  if (/(video|mp4|webm|mov|mkv|screen)/.test(blob)) return 'video';
  return 'audio';
}

export default function CallAudioField({
  audioUri,
  audioName,
  audioKind,
  onChange,
  unlocked = false,
  credits = 0,
  cost = 4,
  unlocking = false,
  onUnlock,
  onShop,
}) {
  const [recording, setRecording] = useState(null);
  const [busy, setBusy] = useState(false);

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(title + (message ? `\n\n${message}` : ''));
      return;
    }
    Alert.alert(title, message);
  };

  const finish = (file) => {
    if (!file?.uri) return;
    onChange({
      uri: file.uri,
      name: file.name || file.fileName || 'call-recording',
      kind: kindFromName(file.name || file.fileName, file.mimeType),
    });
  };

  const attachFile = async () => {
    if (!unlocked) {
      notify('Credits perk', `Call recordings cost ${cost} credits. Unlock in the shop.`);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'audio/*',
          'video/*',
          'audio/mpeg',
          'audio/mp4',
          'audio/x-m4a',
          'audio/wav',
          'audio/3gpp',
          'video/mp4',
          'video/quicktime',
          'video/webm',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      finish(res.assets[0]);
    } catch (e) {
      notify('Recording', e?.message || 'Could not attach a file.');
    } finally {
      setBusy(false);
    }
  };

  const attachScreen = async () => {
    if (!unlocked) {
      notify('Credits perk', `Call recordings cost ${cost} credits. Unlock in the shop.`);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 1,
        videoMaxDuration: 600,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const file = res.assets[0];
      onChange({
        uri: file.uri,
        name: file.fileName || 'screen-recording.mp4',
        kind: 'video',
      });
    } catch (e) {
      notify('Screen recording', e?.message || 'Could not open gallery videos.');
    } finally {
      setBusy(false);
    }
  };

  const startMemo = async () => {
    if (!unlocked) {
      notify('Credits perk', `Call recordings cost ${cost} credits. Unlock in the shop.`);
      return;
    }
    const Audio = audioApi();
    if (!Audio) {
      notify(
        'In-app record',
        'Needs expo-av on this install. You can still attach Voice Recorder, call recorder, or a screen recording.'
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
      if (uri) onChange({ uri, name: 'voice-note.m4a', kind: 'audio' });
    } catch (e) {
      notify('Record', e?.message || 'Could not save the voice note.');
    }
  };

  const play = async () => {
    const Audio = audioApi();
    if (!Audio || !audioUri || audioKind === 'video') {
      notify(
        'Playback',
        'Saved on this device. Open it in Gallery / Files if in-app play is unavailable for this type.'
      );
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
        Timeline cannot tap the live phone line. Attach Voice Recorder, the phone’s call recorder, or a
        screen recording from Gallery. Stays on this device.
      </Text>
      {!unlocked ? (
        <View style={styles.lock}>
          <Text style={styles.lockTitle}>Credits perk · {cost} credits</Text>
          <Text style={styles.hint}>
            Attach and record are locked until you spend credits. You have {credits}. Logging the call
            itself stays free.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.btn}
              onPress={onUnlock}
              disabled={unlocking || credits < cost}
            >
              <Text style={styles.btnText}>
                {unlocking
                  ? 'Unlocking…'
                  : credits >= cost
                    ? `Unlock for ${cost}`
                    : `Need ${cost} (have ${credits})`}
              </Text>
            </TouchableOpacity>
            {onShop ? (
              <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onShop}>
                <Text style={styles.ghostText}>Credits shop</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      {audioUri ? (
        <Text style={styles.file}>
          {audioKind === 'video' ? 'Screen recording · ' : ''}
          {audioName || 'Saved on this device'}
        </Text>
      ) : null}
      {unlocked ? (
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={attachFile} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Working…' : audioUri ? 'Change file' : 'Attach file'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={attachScreen} disabled={busy}>
          <Text style={styles.btnText}>Screen recording</Text>
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
      ) : null}
      {audioUri ? (
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={play}>
            <Text style={styles.ghostText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.ghost]}
            onPress={() => onChange({ uri: '', name: '', kind: 'audio' })}
          >
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
  lock: {
    backgroundColor: '#141428',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  lockTitle: { color: '#c4b5fd', fontSize: 13, fontWeight: '800', marginBottom: 4 },
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
