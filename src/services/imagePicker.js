import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];
const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 0.7;

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

function jpgStoredName(filename, uri) {
  const base = makeStoredName(filename, uri).replace(/\.[a-zA-Z0-9]+$/, '');
  return `${base}.jpg`;
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
 * Web canvas resize/JPEG compress for blob:/data: (and manipulator fallbacks).
 * Returns a data:image/jpeg;base64,... URI suitable for AsyncStorage.
 */
async function compressViaCanvas(uri) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('canvas compress only on web');
  }
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('image has no dimensions'));
          return;
        }
        if (w > MAX_IMAGE_WIDTH) {
          h = Math.round((h * MAX_IMAGE_WIDTH) / w);
          w = MAX_IMAGE_WIDTH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas 2d unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('canvas image load failed'));
    // data: needs no CORS; blob: from same page is fine
    img.src = uri;
  });
}

/**
 * Resize max width ~1280 and JPEG ~0.7 before the URI lands in event state.
 * Native: returns a file:// (or cache) URI. Web: prefers data: JPEG.
 * Never throws — returns original uri on failure so pick still works.
 */
export async function compressImageUri(uri) {
  if (!uri) return uri;
  try {
    // Avoid upscaling small images — only resize when wider than MAX_IMAGE_WIDTH.
    let actions = [{ resize: { width: MAX_IMAGE_WIDTH } }];
    try {
      const { Image } = require('react-native');
      const size = await new Promise((resolve, reject) => {
        Image.getSize(
          uri,
          (w, h) => resolve({ w, h }),
          (err) => reject(err || new Error('getSize failed'))
        );
      });
      if (size && size.w && size.w <= MAX_IMAGE_WIDTH) {
        actions = [];
      }
    } catch (_) {
      // Keep resize action if size unknown (phone photos are usually large).
    }
    const result = await ImageManipulator.manipulateAsync(
      uri,
      actions,
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
        // On web, base64 lets us build a durable data: URI (blob: dies on reload).
        base64: Platform.OS === 'web',
      }
    );
    if (Platform.OS === 'web') {
      if (result?.base64) {
        return `data:image/jpeg;base64,${result.base64}`;
      }
      if (result?.uri) {
        if (result.uri.indexOf('data:') === 0) return result.uri;
        try {
          return await compressViaCanvas(result.uri);
        } catch (e) {
          console.warn('compressImageUri: canvas after manipulator failed', e);
          return result.uri;
        }
      }
    }
    return (result && result.uri) || uri;
  } catch (e) {
    console.warn('compressImageUri: manipulator failed', e);
    if (Platform.OS === 'web') {
      try {
        return await compressViaCanvas(uri);
      } catch (e2) {
        console.warn('compressImageUri: canvas fallback failed', e2);
      }
    }
    return uri;
  }
}

/**
 * Copy a picked/shared image into the app document directory so the URI survives.
 * Do not use File.copy / copyAsync on Android — they throw
 * Missing READ permission on content:// URIs.
 * Write base64 when we have it; otherwise keep the picker URI.
 * Always compress/resize first so web localStorage quota is not blown by full photos.
 */
export async function persistPickedImage(uri, filename, base64, mimeType) {
  if (!uri) return null;
  const originalName = (filename && String(filename).trim()) || makeStoredName(filename, uri);
  const storedName = jpgStoredName(originalName, uri);

  let workingUri = uri;
  let workingBase64 = base64;

  // Web: prefer an immediate data: URI when picker gave base64, then compress.
  if (Platform.OS === 'web') {
    if (workingBase64 && String(workingUri).indexOf('data:') !== 0) {
      const mime = mimeType || 'image/jpeg';
      workingUri = `data:${mime};base64,${workingBase64}`;
    }
    const compressed = await compressImageUri(workingUri);
    let finalUri = compressed || workingUri;
    if (finalUri && finalUri.indexOf('blob:') === 0) {
      try {
        finalUri = await compressViaCanvas(finalUri);
      } catch (e) {
        console.warn('persistPickedImage: blob→data failed', e);
      }
    }
    return { uri: finalUri, filename: originalName.replace(/\.[a-zA-Z0-9]+$/i, '') + '.jpg' };
  }

  // Native: compress (file:// / content://) then persist under documents when needed.
  try {
    const compressed = await compressImageUri(workingUri);
    if (compressed && compressed !== workingUri) {
      // Manipulator wrote a JPEG cache file — durable enough for Expo Go.
      if (String(compressed).indexOf('data:') === 0) {
        const m = String(compressed).match(/^data:[^;]+;base64,(.+)$/);
        if (m) {
          workingBase64 = m[1];
          workingUri = compressed;
        } else {
          return { uri: compressed, filename: storedName };
        }
      } else {
        return { uri: compressed, filename: storedName };
      }
    }
  } catch (e) {
    console.warn('persistPickedImage: compress skipped', e);
  }

  if (workingBase64) {
    try {
      const FileSystem = require('expo-file-system/legacy');
      const dirUri = FileSystem.documentDirectory + 'timeline-images/';
      const info = await FileSystem.getInfoAsync(dirUri);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }
      const dest = dirUri + storedName;
      await FileSystem.writeAsStringAsync(dest, workingBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return { uri: dest, filename: originalName.replace(/\.[a-zA-Z0-9]+$/i, '') + '.jpg' };
    } catch (e) {
      console.warn('persistPickedImage: base64 write failed', e);
    }
  }

  return { uri: workingUri, filename: originalName };
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
      quality: JPEG_QUALITY,
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
      quality: JPEG_QUALITY,
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
