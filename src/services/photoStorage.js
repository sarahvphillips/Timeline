import { getApp } from 'firebase/app';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes, uploadString } from 'firebase/storage';

const PHOTO_FIELDS = ['imageUri', 'coverImageUri'];

function storagePath(uid, eventId, field) {
  return `users/${uid}/events/${eventId}/${field}.jpg`;
}

function isRemote(uri) {
  return typeof uri === 'string' && /^(https?:|gs:)/i.test(uri.trim());
}

async function localBase64(uri) {
  try {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    if (!info?.exists) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return b64 || null;
  } catch (_) {
    return null;
  }
}

async function putImage(storageRef, uri) {
  if (String(uri).startsWith('data:')) {
    await uploadString(storageRef, uri, 'data_url');
    return;
  }
  const b64 = await localBase64(uri);
  if (b64) {
    await uploadString(storageRef, b64, 'base64', { contentType: 'image/jpeg' });
    return;
  }
  let response;
  try {
    response = await fetch(uri);
  } catch (_) {
    response = null;
  }
  if (!response || !response.ok) throw new Error('Could not read the photo on this device.');
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
}

/** Upload one event photo. Returns the existing URI when it is already a web address. */
export async function uploadEventImage(uid, eventId, field, uri) {
  if (!uid || !eventId || !uri || isRemote(uri)) return uri;
  if (!PHOTO_FIELDS.includes(field)) return uri;
  const storageRef = ref(getStorage(getApp()), storagePath(uid, eventId, field));
  await putImage(storageRef, uri);
  const url = await getDownloadURL(storageRef);
  // New address so the phone does not keep showing the previous angle.
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
}

export async function deleteEventPhotos(uid, eventId) {
  if (!uid || !eventId) return;
  const storage = getStorage(getApp());
  await Promise.all(
    PHOTO_FIELDS.map(async (field) => {
      try {
        await deleteObject(ref(storage, storagePath(uid, eventId, field)));
      } catch (_) {
        /* no cloud copy yet */
      }
    })
  );
}
