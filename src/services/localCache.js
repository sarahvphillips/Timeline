import { auth } from './firebase';
import { clearLocalEventsForUid, beginAuthScope as beginEventsAuthScope } from './eventService';
import {
  clearLocalWordNumbersForUid,
  beginAuthScope as beginWordNumbersAuthScope,
} from './wordToIntService';
import {
  clearLocalSpansForUid,
  beginAuthScope as beginSpansAuthScope,
} from './dateSpanService';
import { clearLocalProfilePhotoForUid } from './profileService';

/**
 * Clear ONLY the signed-in uid's on-device caches (events, wordNumbers, spans,
 * profile photo). Does not remove other accounts' keys, does not touch
 * Firestore, and does not clear auth / device id / last_uid.
 */
export async function clearThisAccountLocalCache() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Not signed in');
  }
  await Promise.all([
    clearLocalEventsForUid(uid),
    clearLocalWordNumbersForUid(uid),
    clearLocalSpansForUid(uid),
    clearLocalProfilePhotoForUid(uid),
  ]);
  // Re-bump scopes so any in-flight loads abandon stale results.
  beginEventsAuthScope(uid);
  beginWordNumbersAuthScope(uid);
  beginSpansAuthScope(uid);
  return uid;
}
