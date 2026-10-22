import {
  dateFromExifObject,
  dateFromFileName,
  dateFromImageBytes,
  dateFromVideoBytes,
  describeCapture,
} from './clipTime';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];
const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 0.7;

/** Image.source.uri must be a string. Picker objects crash RCTImageView. */
export function asImageUri(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const inner = value.uri || value.localUri || value.path;
    if (typeof inner === 'string' && inner) return inner;
    if (inner && typeof inner === 'object') return asImageUri(inner);
  }
  return '';
}

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
  if (Platform.OS === 'web') {
    const text = String(uri);
    if (text.indexOf('data:') !== 0 && text.indexOf('blob:') !== 0) return uri;
    try {
      return await compressViaCanvas(text);
    } catch (_) {
      return uri;
    }
  }
  try {
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
      if (size && size.w && size.w <= MAX_IMAGE_WIDTH) actions = [];
    } catch (_) {}
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return (result && result.uri) || uri;
  } catch (e) {
    console.warn('compressImageUri: manipulator failed', e);
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
    let finalUri = tidyDataUrl(compressed || workingUri);
    if (!finalUri || String(finalUri).indexOf('blob:') === 0) {
      try {
        finalUri = await durableImageUri(workingUri);
      } catch (e) {
        console.warn('persistPickedImage: blob→data failed', e);
        finalUri = compressed || workingUri;
      }
    }
    return { uri: asImageUri(finalUri), filename: originalName.replace(/\.[a-zA-Z0-9]+$/i, '') + '.jpg' };
  }

  // Native: compress then copy file:// into app documents so content:// camera URIs do not expire.
  try {
    const compressed = await compressImageUri(workingUri);
    if (compressed && compressed !== workingUri) {
      if (String(compressed).indexOf('data:') === 0) {
        const m = String(compressed).match(/^data:[^;]+;base64,(.+)$/);
        if (m) {
          workingBase64 = m[1];
          workingUri = compressed;
        } else {
          return { uri: compressed, filename: storedName };
        }
      } else {
        workingUri = compressed;
      }
    }
  } catch (e) {
    console.warn('persistPickedImage: compress skipped', e);
  }

  if (Platform.OS !== 'web' && String(workingUri).indexOf('file:') === 0) {
    try {
      const FileSystem = require('expo-file-system/legacy');
      const dirUri = FileSystem.documentDirectory + 'timeline-images/';
      const info = await FileSystem.getInfoAsync(dirUri);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }
      const dest = dirUri + storedName;
      await FileSystem.copyAsync({ from: workingUri, to: dest });
      return { uri: dest, filename: storedName };
    } catch (e) {
      console.warn('persistPickedImage: file copy failed', e);
      return { uri: workingUri, filename: storedName };
    }
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

function tidyDataUrl(uri) {
  const text = String(uri || '');
  if (text.indexOf('data:') !== 0) return text;
  const comma = text.indexOf(',');
  if (comma < 0) return text;
  return text.slice(0, comma + 1) + text.slice(comma + 1).replace(/\s/g, '');
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob || typeof FileReader === 'undefined') {
      reject(new Error('Could not read that photo.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(tidyDataUrl(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read that photo.'));
    reader.readAsDataURL(blob);
  });
}

async function fileToJpegDataUrl(file) {
  if (file && typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = bitmap.width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / bitmap.width : 1;
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.drawImage(bitmap, 0, 0, w, h);
      if (typeof bitmap.close === 'function') bitmap.close();
      return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    } catch (e) {
      console.warn('fileToJpegDataUrl failed', e);
    }
  }
  if (file) return readBlobAsDataUrl(file);
  return '';
}
async function durableImageUri(uri, file, base64, mimeType) {
  if (file) {
    try {
      return await readBlobAsDataUrl(file);
    } catch (e) {
      console.warn('durableImageUri: file read failed', e);
    }
  }
  if (base64 && String(uri || '').indexOf('data:') !== 0) {
    return tidyDataUrl(`data:${mimeType || 'image/jpeg'};base64,${base64}`);
  }
  const text = String(uri || '');
  if (text.indexOf('data:') === 0) return tidyDataUrl(text);
  if (text.indexOf('blob:') === 0 && typeof fetch === 'function') {
    const response = await fetch(text);
    const blob = await response.blob();
    return readBlobAsDataUrl(blob);
  }
  return text;
}

async function persistAsset(asset) {
  if (!asset || !asset.uri) return null;
  const name = asset.fileName || asset.filename || asset.name || null;
  if (Platform.OS === 'web') {
    let dataUrl = '';
    if (asset.file) dataUrl = await fileToJpegDataUrl(asset.file);
    if (!dataUrl) dataUrl = await durableImageUri(asset.uri, null, asset.base64, asset.mimeType);
    if (!dataUrl || String(dataUrl).indexOf('blob:') === 0) {
      tell('Photo not kept', 'This browser could not read that picture. Choose a JPEG or PNG.');
      return null;
    }
    return { uri: tidyDataUrl(dataUrl), filename: (name || 'photo').replace(/\.[a-zA-Z0-9]+$/i, '') + '.jpg' };
  }
  return persistPickedImage(asset.uri, name, asset.base64, asset.mimeType);
}

function tell(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(title + '\n\n' + message);
    return;
  }
  Alert.alert(title, message);
}

async function launchLibrary() {
  const options = {
    allowsEditing: false,
    quality: JPEG_QUALITY,
    base64: Platform.OS !== 'web',
  };
  try {
    return await ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: ['images'] });
  } catch (first) {
    try {
      return await ImagePicker.launchImageLibraryAsync(options);
    } catch (_) {
      throw first;
    }
  }
}
export async function pickFromGallery() {
  try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        tell('Photos permission', 'Permission to access your photos is needed to choose a picture.');
        return null;
      }
    }
    const result = await launchLibrary();
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    return persistAsset(result.assets[0]);
  } catch (e) {
    tell('Could not open gallery', e && e.message ? e.message : 'Please try again.');
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
      quality: 0.5,
      base64: Platform.OS === 'web',
      exif: false,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    const asset = result.assets[0];
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: MAX_IMAGE_WIDTH } }],
        {
          compress: JPEG_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: Platform.OS === 'web',
        }
      );
      if (Platform.OS === 'web' && compressed?.base64) {
        return persistPickedImage(
          `data:image/jpeg;base64,${compressed.base64}`,
          asset.fileName || 'camera.jpg',
          compressed.base64,
          'image/jpeg'
        );
      }
      return persistPickedImage(
        compressed?.uri || asset.uri,
        asset.fileName || 'camera.jpg',
        null,
        'image/jpeg'
      );
    } catch (e) {
      console.warn('pickFromCamera: compress failed', e);
      return persistPickedImage(asset.uri, asset.fileName || 'camera.jpg', asset.base64, asset.mimeType);
    }
  } catch (e) {
    Alert.alert(
      'Could not open camera',
      e && e.message ? e.message : 'Please try again, or choose a photo from the gallery.'
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

export function isVideoPicked(assetOrUri) {
  const mime = String(assetOrUri?.mimeType || assetOrUri?.type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const uri = typeof assetOrUri === 'string' ? assetOrUri : assetOrUri?.uri || '';
  return /\.(mp4|mov|m4v|webm|3gp)(\?|#|$)/i.test(String(uri));
}

async function persistWashAsset(asset) {
  if (!asset || !asset.uri) return null;
  if (isVideoPicked(asset)) {
    return {
      uri: asset.uri,
      filename: asset.fileName || asset.filename || 'wash.mp4',
      kind: 'video',
    };
  }
  const picked = await persistAsset(asset);
  if (!picked) return null;
  return { ...picked, kind: 'image' };
}

export async function pickWashFromGallery() {
  try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photos permission',
          'Permission to access photos and videos is needed for a wash load.'
        );
        return null;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: JPEG_QUALITY,
      base64: true,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    return persistWashAsset(result.assets[0]);
  } catch (e) {
    Alert.alert('Could not open gallery', e && e.message ? e.message : 'Please try again.');
    return null;
  }
}

export async function pickWashFromCamera(video) {
  try {
    if (!isCameraAvailable()) {
      Alert.alert(
        'Camera unavailable',
        'This device cannot record. Choose from gallery or files instead.'
      );
      return null;
    }
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera permission', 'Permission to use the camera is needed.');
        return null;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: video ? ['videos'] : ['images'],
      allowsEditing: false,
      quality: JPEG_QUALITY,
      base64: !video,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    return persistWashAsset(result.assets[0]);
  } catch (e) {
    Alert.alert(
      'Could not open camera',
      e && e.message ? e.message : 'Camera is not available here. Try gallery or files.'
    );
    return null;
  }
}

export async function pickWashFromFile() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'video/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    const asset = result.assets[0];
    return persistWashAsset({
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType,
      base64: asset.base64,
    });
  } catch (e) {
    Alert.alert('Could not open files', e && e.message ? e.message : 'Please try again.');
    return null;
  }
}

export async function pickWashFromSource(source) {
  if (source === 'camera') return pickWashFromCamera(false);
  if (source === 'video') return pickWashFromCamera(true);
  if (source === 'gallery') return pickWashFromGallery();
  if (source === 'file') return pickWashFromFile();
  return null;
}

/** Gallery photo or video for a timeline clip. Phone copies videos into the app folder. */
function bytesFromBase64(text) {
  const raw = String(text || '').replace(/^data:[^,]*,/, '');
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(raw, 'base64'));
}

async function readFilePart(uri, start, length) {
  if (!uri || String(uri).startsWith('data:')) return null;
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      const from = Math.max(0, Math.min(start || 0, blob.size));
      const slice = blob.slice(from, from + length);
      return new Uint8Array(await slice.arrayBuffer());
    }
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    if (info?.size && info.size > 400 * 1024 * 1024) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: Math.max(0, start || 0),
      length,
    });
    let bytes = bytesFromBase64(b64);
    if (bytes.length > length + 64) {
      bytes = start > 0 ? bytes.subarray(Math.max(0, bytes.length - length)) : bytes.subarray(0, length);
    }
    return bytes;
  } catch (e) {
    console.warn('readFilePart failed', e);
    return null;
  }
}

function nameFromUri(uri) {
  try {
    const path = decodeURIComponent(String(uri || '').split('?')[0]);
    const base = path.split('/').pop() || '';
    if (!base || base.length > 180) return '';
    if (/^blob:/i.test(base) || /^content:/i.test(String(uri || ''))) return '';
    return base;
  } catch (_) {
    return '';
  }
}

function clipName(asset, filename) {
  const given = String(filename || asset?.fileName || asset?.filename || asset?.name || '').trim();
  const fromUri = nameFromUri(asset?.uri);
  return [given, fromUri].filter(Boolean).join(' ');
}

async function captureInstant(asset, kind, filename) {
  const fromExif = dateFromExifObject(asset?.exif);
  if (fromExif) return { capturedAt: fromExif.toISOString(), capturedFrom: 'exif' };
  const lookAt = kind === 'video' ? 2 * 1024 * 1024 : 1024 * 1024;
  const head = await readFilePart(asset?.uri, 0, lookAt);
  let tail = null;
  if (kind === 'video' && asset?.uri) {
    try {
      let size = 0;
      if (Platform.OS === 'web') {
        const blob = await (await fetch(asset.uri)).blob();
        size = blob.size || 0;
      } else {
        const FileSystem = require('expo-file-system/legacy');
        const info = await FileSystem.getInfoAsync(asset.uri);
        size = info?.size || 0;
      }
      if (size > lookAt) tail = await readFilePart(asset.uri, Math.max(0, size - lookAt), lookAt);
    } catch (e) {
      console.warn('clip tail read failed', e);
    }
  }
  const fromBytes = kind === 'video'
    ? dateFromVideoBytes(head) || dateFromVideoBytes(tail) || dateFromImageBytes(head) || dateFromImageBytes(tail)
    : dateFromImageBytes(head) || dateFromImageBytes(tail);
  if (fromBytes) return { capturedAt: fromBytes.toISOString(), capturedFrom: kind === 'video' ? 'video' : 'exif' };
  const names = clipName(asset, filename);
  const fromName = dateFromFileName(names);
  if (fromName) {
    const clock = /(\d{4})[-_. ]?\d{2}[-_. ]?\d{2}[^\d]{0,6}\d{2}[-_.: ]?\d{2}/.test(names)
      || /(?:^|[^\d])\d{2}[-_. ]\d{2}[-_. ]\d{4}[^\d]{0,6}\d{2}[-_.: ]\d{2}/.test(names);
    return { capturedAt: fromName.toISOString(), capturedFrom: clock ? 'name' : 'name-date' };
  }
  return { capturedAt: '', capturedFrom: '' };
}

export async function pickClipFromGallery() {
  try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        tell('Photos permission', 'Permission to access photos and videos is needed.');
        return null;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: JPEG_QUALITY,
      exif: true,
      base64: false,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return null;
    const asset = result.assets[0];
    const filename = String(asset.fileName || asset.filename || asset.name || '').trim();
    const kind = isVideoPicked(asset) ? 'video' : 'image';
    const when = await captureInstant(asset, kind, filename);
    const stored = await persistWashAsset(asset);
    if (!stored?.uri) return null;
    let uri = stored.uri;
    if (kind === 'video' && Platform.OS !== 'web') {
      try {
        const FileSystem = require('expo-file-system/legacy');
        const dirUri = FileSystem.documentDirectory + 'timeline-clips/';
        const info = await FileSystem.getInfoAsync(dirUri);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
        const safe = String(stored.filename || filename || 'clip.mp4').replace(/[^\w.\-]+/g, '_');
        const dest = `${dirUri}${Date.now()}-${safe}`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      } catch (e) {
        console.warn('pickClipFromGallery: video copy failed', e);
      }
    }
    return {
      ...stored,
      uri,
      filename: stored.filename || filename,
      kind,
      capturedAt: when.capturedAt,
      capturedFrom: when.capturedFrom,
      capturedLabel: describeCapture(when.capturedFrom),
    };
  } catch (e) {
    tell('Could not open gallery', e && e.message ? e.message : 'Please try again.');
    return null;
  }
}


/**
 * Turn a photo 90 degrees clockwise and return a stored URI.
 * Works for a local file, a data URL, or an https photo already on the event.
 * Tap again for another quarter turn (twice turns it the right way up).
 */
export async function rotateImageQuarter(uri) {
  const src = asImageUri(uri);
  if (!src) return '';
  if (Platform.OS === 'web') {
    const turned = await rotateQuarterOnWeb(src);
    return tidyDataUrl(turned);
  }
  let local = src;
  if (/^https?:/i.test(src)) {
    const FileSystem = require('expo-file-system/legacy');
    const dest = FileSystem.cacheDirectory + 'turn_' + Date.now() + '.jpg';
    const downloaded = await FileSystem.downloadAsync(src, dest);
    local = (downloaded && downloaded.uri) || src;
  }
  const result = await ImageManipulator.manipulateAsync(
    local,
    [{ rotate: 90 }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );
  const stored = await persistPickedImage(result && result.uri ? result.uri : local, 'turned.jpg', null, 'image/jpeg');
  return asImageUri(stored) || (result && result.uri) || '';
}

function rotateQuarterOnWeb(uri) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      reject(new Error('Could not turn that photo in this browser.'));
      return;
    }
    const img = new window.Image();
    if (/^https?:/i.test(String(uri))) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('Could not read that photo.'));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = h;
        canvas.height = w;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not turn that photo.'));
          return;
        }
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Could not read that photo.'));
    const start = async () => {
      try {
        if (/^https?:/i.test(String(uri))) {
          const response = await fetch(uri);
          const blob = await response.blob();
          img.src = await readBlobAsDataUrl(blob);
          return;
        }
        img.src = uri;
      } catch (e) {
        reject(e);
      }
    };
    start();
  });
}

/** Next quarter turn. 0, 90, 180, 270. Two taps turns an upside-down photo the right way up. */
export function quarterTurn(current) {
  const n = Number(current);
  const base = Number.isFinite(n) ? n : 0;
  return (((Math.round(base / 90) * 90) % 360) + 360 + 90) % 360;
}

/** RN style for a stored quarter turn. Null when the photo is already upright. */
export function photoTurnStyle(degrees) {
  const n = Number(degrees);
  if (!Number.isFinite(n)) return null;
  const turn = ((Math.round(n / 90) * 90) % 360 + 360) % 360;
  if (!turn) return null;
  return { transform: [{ rotate: turn + 'deg' }] };
}
