import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];

function extFromName(name) {
  const m = String(name || '').match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  if (!m) return '';
  const ext = m[1].toLowerCase();
  if (ext === 'jpeg') return 'jpg';
  return IMAGE_EXTS.includes(ext) ? ext : '';
}

function makeStoredName(filename, uri) {
  const ext = extFromName(filename) || extFromName(uri) || 'jpg';
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export function isCameraAvailable() {
  if (Platform.OS !== 'web') return true;
  try {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
  } catch (_) {
    return false;
  }
}

/**
 * Copy a picked/shared image into the app document directory so the URI survives.
 * Do not use File.copy / copyAsync on Android — they throw
 * Missing READ permission on content:// URIs.
 * Write base64 when we have it; otherwise keep the picker URI.
 */
export async function persistPickedImage(uri, filename, base64, mimeType) {
  if (!uri) return null;
  const originalName = (filename && String(filename).trim()) || makeStoredName(filename, uri);
  const storedName = makeStoredName(originalName, uri);

  if (Platform.OS === 'web') {
    if (base64 && String(uri).indexOf('data:') !== 0) {
      const mime = mimeType || 'image/jpeg';
      return { uri: 'data:' + mime + ';base64,' + base64, filename: originalName };
    }
    return { uri, filename: originalName };
  }

  if (base64) {
    try {
      const FileSystem = require('expo-file-system/legacy');
      const dirUri = FileSystem.documentDirectory + 'timeline-images/';
      const info = await FileSystem.getInfoAsync(dirUri);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }
      const dest = dirUri + storedName;
      await FileSystem.writeAsStringAsync(dest, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return { uri: dest, filename: originalName };
    } catch (e) {
      console.warn('persistPickedImage: base64 write failed', e);
    }
  }

  return { uri, filename: originalName };
}

async function persistAsset(asset) {
  if (!asset || !asset.uri) return null;
  const name = asset.fileName || asset.filename || asset.name || null;
  return persistPickedImage(asset.uri, name, asset.base64, asset.mimeType);
}

export async function pickFromGallery() {
  try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photos permission',
          'Permission to access your photos is needed to choose a picture.'
        );
        return null;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
      // base64 avoids Android File.copy READ permission errors
      base64: true,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    return persistAsset(result.assets[0]);
  } catch (e) {
    Alert.alert('Could not open gallery', e && e.message ? e.message : 'Please try again.');
    return null;
  }
}

export async function pickFromCamera() {
  try {
    if (!isCameraAvailable()) {
      Alert.alert(
        'Camera unavailable',
        'This browser or device cannot take a photo. Choose from gallery or files instead.'
      );
      return null;
    }
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Camera permission',
          'Permission to use the camera is needed to take a photo.'
        );
        return null;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    return persistAsset(result.assets[0]);
  } catch (e) {
    Alert.alert(
      'Could not open camera',
      e && e.message ? e.message : 'Camera is not available here. Try gallery or files.'
    );
    return null;
  }
}

export async function pickFromFile() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    const asset = result.assets[0];
    return persistPickedImage(asset.uri, asset.name, asset.base64, asset.mimeType);
  } catch (e) {
    Alert.alert('Could not open files', e && e.message ? e.message : 'Please try again.');
    return null;
  }
}

export async function pickFromSource(source) {
  if (source === 'camera') return pickFromCamera();
  if (source === 'gallery') return pickFromGallery();
  if (source === 'file') return pickFromFile();
  return null;
}

/**
 * Native action sheet via Alert. Returns true if Alert was shown.
 * Web Alert cannot show multiple buttons — callers should use ImageSourceSheet instead.
 */
export function promptImageSourceNative(opts) {
  const onPicked = opts && opts.onPicked;
  const showRemove = opts && opts.showRemove;
  const onRemove = opts && opts.onRemove;
  const title = (opts && opts.title) || 'Add photo';
  if (Platform.OS === 'web') return false;
  const buttons = [];
  if (isCameraAvailable()) {
    buttons.push({
      text: 'Take photo',
      onPress: async () => {
        const picked = await pickFromCamera();
        if (picked) onPicked(picked);
      },
    });
  }
  buttons.push({
    text: 'Choose from gallery',
    onPress: async () => {
      const picked = await pickFromGallery();
      if (picked) onPicked(picked);
    },
  });
  buttons.push({
    text: 'Choose file',
    onPress: async () => {
      const picked = await pickFromFile();
      if (picked) onPicked(picked);
    },
  });
  if (showRemove) {
    buttons.push({
      text: 'Remove photo',
      style: 'destructive',
      onPress: () => {
        if (onRemove) onRemove();
      },
    });
  }
  buttons.push({ text: 'Cancel', style: 'cancel' });
  Alert.alert(title, 'On Android, Google Photos appears in the system gallery.', buttons);
  return true;
}
