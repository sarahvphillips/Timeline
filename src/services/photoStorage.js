import { getApp } from 'firebase/app';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes, uploadString } from 'firebase/storage';

const PHOTO_FIELDS = ['imageUri', 'coverImageUri'];

function storagePath(uid, eventId, field) {
  return `users/${uid}/events/${eventId}/${field}.jpg`;
}

function isRemote(uri) {
  return typeof uri === 'string' && /^(https?:|gs:)/i.test(uri.trim());
}

async function putImage(storageRef, uri) {
  if (String(uri).startsWith('data:')) {
    await uploadString(storageRef, uri, 'data_url');
    return;
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the photo on this device.');
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
}

/** Upload one event photo. Returns the existing URI when it is already a web address. */
export async function uploadEventImage(uid, eventId, field, uri) {
  if (!uid || !eventId || !uri || isRemote(uri)) return uri;
  if (!PHOTO_FIELDS.includes(field)) return uri;
  const storageRef = ref(getStorage(getApp()), storagePath(uid, eventId, field));
  await putImage(storageRef, uri);
  return getDownloadURL(storageRef);
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
