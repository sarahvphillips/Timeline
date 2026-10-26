/**
 * Timeline Bot API — one HTTPS function `api` (Cloud Functions v2 + Express).
 *
 * Auth: `Authorization: Bearer <key>`. Only the SHA-256 hash of a key is stored,
 * at botKeys/{hash} -> { uid, createdAt, lastUsedAt, revoked }.
 * Every request is scoped to that uid only.
 *
 * Events are written to users/{uid}/events/{id} in the same shape as
 * src/services/eventService.js saveEvent(), plus addedBy: 'bot'.
 * Photos go to Storage at users/{uid}/events/{eventId}/imageUri.jpg
 * (same path as src/services/photoStorage.js).
 * Tickets / PDFs go to users/{uid}/events/{eventId}/attachments/<name> and are listed
 * in event.attachments [{ name, contentType, size, storagePath, url, addedAt, addedBy }].
 * Share invites mirror shareService.createEventShare (sharedEvents + eventInvites/{code}).
 */
const crypto = require('crypto');
const express = require('express');
const Busboy = require('busboy');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage, getDownloadURL } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const { createSync } = require('./sync');
const { createGuard } = require('./guard');
const { registerAdmin } = require('./adminRoutes');
const { publicProfile } = require('./lib/profile');
const { decideKeyCreate } = require('./lib/keys');
const { tombstone } = require('./lib/delta');
const { foldEvents, encodeCursor, decodeCursor } = require('./lib/recap');

initializeApp();
setGlobalOptions({ region: 'europe-west2' });

const db = getFirestore();
const { bumpSync } = createSync(db, FieldValue);

const APP_SCHEME = 'timelineapp'; // app.json "scheme"
const RATE_LIMIT_PER_MINUTE = 60;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // matches storage.rules
const MAX_FILE_BYTES = 10 * 1024 * 1024; // tickets / attachments (PDF or image)
const MAX_ATTACHMENTS = 10;
const ATTACHMENT_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};
const INVITE_DAYS = 14; // same as shareService.createEventShare
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // same as shareService
const FRIEND_COLOUR = '#f472b6'; // FRIEND_COLOURS[0] in shareService
const MAX_LIST = 200;
const SCAN_CAP = 1000;

/** Quick-reply kinds from the bot skill -> existing app source/category. */
const KINDS = {
  memory: { source: 'manual', category: 'personal' },
  event: { source: 'manual', category: 'personal' },
  photo: { source: 'photo', category: 'photo' },
  poem: { source: 'hobby', category: 'hobby', hobbyType: 'poetry' },
  food: { source: 'food', category: 'other' },
  social: { source: 'social', category: 'hobby' },
  other: { source: 'manual', category: 'other' },
};

/** GET /events?kind= -> same buckets as POST /events kinds (and the app's year-bubble classifier). */
const FILTER_KINDS = ['social', 'poem', 'memory', 'event', 'photo', 'food', 'todo', 'other'];
function hasLabel(e, name) {
  return Array.isArray(e.labels) && e.labels.some((l) => String(l).trim().toLowerCase() === name);
}
function isPoem(e) {
  const src = String(e.source || '').toLowerCase();
  return String(e.hobbyType || '').toLowerCase() === 'poetry' || src === 'poem' || hasLabel(e, 'poem');
}
function isTodoEvent(e) {
  return String(e.source || '').toLowerCase() === 'todo' || !!e.fromTodo;
}
function isPhoto(e) {
  const src = String(e.source || '').toLowerCase();
  const cat = String(e.category || '').toLowerCase();
  if (src === 'photo' || src === 'image' || cat === 'photo') return true;
  if (src === 'clip' && String(e.clipKind || '').toLowerCase() === 'video') return false;
  const generic = !src || src === 'manual' || src === 'share' || src === 'clip' || src === 'bot';
  const plain = !cat || cat === 'personal' || cat === 'other' || cat === 'event';
  return !!(e.imageUri || e.coverImageUri) && generic && plain && !isPoem(e) && !isTodoEvent(e);
}
function matchesKind(e, kind) {
  const src = String(e.source || 'manual').toLowerCase();
  const cat = String(e.category || '').toLowerCase();
  switch (kind) {
    case 'poem': return isPoem(e);
    case 'social': return src === 'social';
    case 'food': return src === 'food';
    case 'todo': return isTodoEvent(e);
    case 'photo': return isPhoto(e);
    // memory and event are stored the same way (source manual); "other" = manual + category other.
    case 'memory':
    case 'event': return src === 'manual' && cat !== 'other' && !isPoem(e) && !isTodoEvent(e) && !isPhoto(e);
    case 'other': return src === 'manual' && cat === 'other' && !isPoem(e) && !isTodoEvent(e) && !isPhoto(e);
    default: return true;
  }
}

/** Fields a bot may set on create / patch. Protected: id, ownerUid, addedBy, createdAt. */
const WRITABLE = [
  'title', 'description', 'date', 'category', 'source', 'labels', 'location',
  'nextAction', 'hobbyType', 'collectionName', 'imageUri', 'coverImageUri',
  'photoNote', 'coverPhotoNote', 'shareCaption', 'placeName', 'foodStatus',
  'foodItems', 'emailFrom', 'botNote',
  'socialUrl', 'socialTitle', 'socialPlatform', 'socialAction', 'socialNote', 'url',
  'driveUrl', 'readingUrl',
  'mealKit', 'recipeName', 'cardNumber', 'cookMinutes', 'mealTags', 'recipeUrl',
];

/** Meal-kit fields (AddFoodScreen) are plain strings; cap their length. */
const MEAL_KIT_CAPS = {
  mealKit: 40, recipeName: 300, cardNumber: 40, cookMinutes: 20, mealTags: 500, recipeUrl: 2000,
};

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra && extra.retryAfter) this.retryAfter = extra.retryAfter;
    if (extra && extra.code) this.code = extra.code;
    if (extra && extra.details) this.details = extra.details;
  }
}

const guard = createGuard(db, HttpError, { limit: RATE_LIMIT_PER_MINUTE });

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** Same id format as eventService.saveEvent. */
const newEventId = () => Date.now().toString() + Math.random().toString(36).slice(2, 8);

const eventsCol = (uid) => db.collection('users').doc(uid).collection('events');

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stripUndefined).filter((v) => v !== undefined);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => {
      const v = stripUndefined(value[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  return value;
}

function toIso(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return value;
}

function links(id) {
  return { appLink: `${APP_SCHEME}://event/${id}`, webLink: null };
}

function present(data, id) {
  const ev = { ...data, id: data.id || id };
  ['date', 'createdAt', 'updatedAt'].forEach((k) => {
    if (ev[k]) ev[k] = toIso(ev[k]);
  });
  return { ...ev, ...links(ev.id) };
}

function parseDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new HttpError(400, `${field} must be an ISO date, e.g. 2026-10-18 or 2026-10-18T14:30:00Z`);
  return d.toISOString();
}

function pickWritable(body) {
  const out = {};
  WRITABLE.forEach((k) => {
    if (body[k] !== undefined) out[k] = body[k];
  });
  if (out.title !== undefined) out.title = String(out.title).trim().slice(0, 300);
  if (out.description !== undefined) out.description = String(out.description).slice(0, 20000);
  if (out.labels !== undefined) {
    if (!Array.isArray(out.labels)) throw new HttpError(400, 'labels must be an array of strings');
    out.labels = out.labels.map((l) => String(l).trim()).filter(Boolean).slice(0, 50);
  }
  if (out.date !== undefined) out.date = parseDate(out.date, 'date');
  ['imageUri', 'coverImageUri'].forEach((k) => {
    if (out[k] !== undefined && out[k] !== null && !/^https:\/\//i.test(String(out[k]))) {
      throw new HttpError(400, `${k} must be an https download URL from POST /photos`);
    }
  });
  Object.keys(MEAL_KIT_CAPS).forEach((k) => {
    if (out[k] !== undefined && out[k] !== null) out[k] = String(out[k]).trim().slice(0, MEAL_KIT_CAPS[k]);
  });
  ['socialUrl', 'url', 'driveUrl', 'readingUrl', 'recipeUrl'].forEach((k) => {
    if (out[k] !== undefined && out[k] !== null && !/^https:\/\//i.test(String(out[k]))) {
      throw new HttpError(400, `${k} must be an https URL`);
    }
  });
  return out;
}

// ---------- auth + rate limit ----------

async function authenticate(req) {
  const header = String(req.get('authorization') || '');
  const m = header.match(/^Bearer\s+(\S{16,})$/i);
  if (!m) throw new HttpError(401, 'Missing or malformed Authorization: Bearer <key>');
  const hash = sha256(m[1]);
  const ref = db.collection('botKeys').doc(hash);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(401, 'Unknown key');
  const key = snap.data();
  if (key.revoked || !key.uid) throw new HttpError(401, 'Key revoked');
  const lastMs = key.lastUsedAt && typeof key.lastUsedAt.toMillis === 'function' ? key.lastUsedAt.toMillis() : 0;
  if (Date.now() - lastMs >= 60 * 1000) {
    ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
  }
  return { uid: key.uid, hash };
}

// ---------- photos ----------

function decodeBase64Image(input, contentType) {
  let data = String(input || '');
  let type = contentType;
  const m = data.match(/^data:([^;]+);base64,(.*)$/s);
  if (m) {
    type = type || m[1];
    data = m[2];
  }
  return { buffer: Buffer.from(data, 'base64'), contentType: type || 'image/jpeg' };
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let file = null;
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_IMAGE_BYTES + 1 } });
    bb.on('field', (name, val) => {
      fields[name] = val;
    });
    bb.on('file', (_name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        file = { buffer: Buffer.concat(chunks), contentType: info.mimeType };
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, file }));
    bb.end(req.rawBody);
  });
}

async function readImage(req) {
  const type = String(req.get('content-type') || '').toLowerCase();
  if (type.startsWith('multipart/form-data')) {
    const { fields, file } = await readMultipart(req);
    if (!file) throw new HttpError(400, 'multipart upload needs one file field');
    return { ...file, eventId: fields.eventId };
  }
  if (type.startsWith('image/')) {
    return { buffer: req.rawBody, contentType: type.split(';')[0], eventId: req.query.eventId };
  }
  const body = req.body || {};
  if (!body.imageBase64) throw new HttpError(400, 'Send JSON { imageBase64, contentType?, eventId? }, multipart/form-data, or a raw image/* body');
  return { ...decodeBase64Image(body.imageBase64, body.contentType), eventId: body.eventId };
}

async function storeImage(uid, eventId, { buffer, contentType }) {
  if (!buffer || !buffer.length) throw new HttpError(400, 'Empty image');
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image must be under 5 MB');
  if (!/^image\//.test(contentType || '')) throw new HttpError(415, 'Only image/* uploads are allowed here; send PDFs and tickets to POST /events/:id/attachments or as attachments on POST /events');
  const storagePath = `users/${uid}/events/${eventId}/imageUri.jpg`;
  const file = getStorage().bucket().file(storagePath);
  await file.save(buffer, { contentType, resumable: false, metadata: { metadata: { addedBy: 'bot' } } });
  const downloadUrl = await getDownloadURL(file);
  return { storagePath, downloadUrl };
}

// ---------- attachments (tickets, PDFs) ----------

function safeFileName(name, contentType) {
  const ext = ATTACHMENT_TYPES[contentType];
  let base = String(name || '').split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]{1,5}$/, '');
  base = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
  return `${base || 'ticket'}.${ext}`;
}

function decodeBase64File(input, contentType, name) {
  let data = String(input || '');
  let type = contentType;
  const m = data.match(/^data:([^;]+);base64,(.*)$/s);
  if (m) {
    type = type || m[1];
    data = m[2];
  }
  return { buffer: Buffer.from(data, 'base64'), contentType: String(type || 'application/pdf').toLowerCase(), name };
}

function readMultipartFile(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let file = null;
    let tooBig = false;
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: maxBytes + 1 } });
    bb.on('field', (n, v) => { fields[n] = v; });
    bb.on('file', (_n, stream, info) => {
      const chunks = [];
      stream.on('limit', () => { tooBig = true; });
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        file = { buffer: Buffer.concat(chunks), contentType: String(info.mimeType || '').toLowerCase(), name: info.filename };
      });
    });
    bb.on('error', reject);
    bb.on('close', () => (tooBig ? reject(new HttpError(413, 'File must be under 10 MB')) : resolve({ fields, file })));
    bb.end(req.rawBody);
  });
}

/** Reads one attachment from JSON base64, multipart/form-data, or a raw application/pdf / image body. */
async function readAttachment(req) {
  const type = String(req.get('content-type') || '').toLowerCase();
  if (type.startsWith('multipart/form-data')) {
    const { fields, file } = await readMultipartFile(req, MAX_FILE_BYTES);
    if (!file) throw new HttpError(400, 'multipart upload needs one file field');
    return { ...file, name: fields.name || file.name };
  }
  if (type.startsWith('application/pdf') || type.startsWith('image/')) {
    return { buffer: req.rawBody, contentType: type.split(';')[0], name: req.query.name };
  }
  const body = req.body || {};
  const b64 = body.fileBase64 || body.pdfBase64 || body.base64;
  if (!b64) throw new HttpError(400, 'Send JSON { fileBase64, contentType, name? }, multipart/form-data, or a raw application/pdf body');
  return decodeBase64File(b64, body.contentType, body.name || body.fileName);
}

async function storeAttachment(uid, eventId, { buffer, contentType, name }, existing = []) {
  if (!buffer || !buffer.length) throw new HttpError(400, 'Empty file');
  if (buffer.length > MAX_FILE_BYTES) throw new HttpError(413, 'File must be under 10 MB');
  if (!ATTACHMENT_TYPES[contentType]) {
    throw new HttpError(415, `contentType must be one of: ${Object.keys(ATTACHMENT_TYPES).join(', ')}`);
  }
  if (contentType === 'application/pdf' && buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
    throw new HttpError(400, 'File is not a valid PDF (missing %PDF- header)');
  }
  if (existing.length >= MAX_ATTACHMENTS) throw new HttpError(409, `An event can have at most ${MAX_ATTACHMENTS} attachments`);
  let fileName = safeFileName(name, contentType);
  if (existing.some((a) => a && a.name === fileName)) fileName = `${Date.now().toString(36)}-${fileName}`;
  const storagePath = `users/${uid}/events/${eventId}/attachments/${fileName}`;
  const file = getStorage().bucket().file(storagePath);
  await file.save(buffer, { contentType, resumable: false, metadata: { metadata: { addedBy: 'bot' } } });
  const url = await getDownloadURL(file);
  return {
    name: fileName,
    contentType,
    size: buffer.length,
    storagePath,
    url,
    addedAt: new Date().toISOString(),
    addedBy: 'bot',
  };
}

/** Keep the shared copy in step so friends who accepted the invite can open the ticket too. */
async function syncSharedAttachments(event) {
  if (!event || !event.shareId) return;
  const ref = db.collection('sharedEvents').doc(event.shareId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().createdByUid !== event.ownerUid) return;
  await ref.update({ attachments: event.attachments || [], updatedAt: new Date().toISOString() });
}

function validEventId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id);
}

// ---------- app ----------

const app = express();
app.use(express.json({ limit: '15mb' })); // 10 MB file as base64 is ~13.4 MB

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (e.retryAfter) res.set('Retry-After', String(e.retryAfter));
    const body = { error: status >= 500 ? 'Server error' : e.message };
    if (e.code) body.code = e.code;
    if (e.details && typeof e.details === 'object') Object.assign(body, e.details);
    res.status(status).json(body);
  });

// ---------- key management (signed-in app user, Firebase ID token) ----------
// These routes use `Authorization: Bearer <Firebase ID token>`, not a bot key.

async function appUser(req) {
  const m = String(req.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!m) throw new HttpError(401, 'Sign in first (missing Firebase ID token)');
  try {
    const decoded = await getAuth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch (_) {
    throw new HttpError(401, 'Invalid or expired sign-in token');
  }
}

const keyView = (d) => {
  const k = d.data();
  return {
    hash: d.id,
    label: k.label || '',
    revoked: !!k.revoked,
    botType: k.botType || '',
    createdAt: toIso(k.createdAt) || null,
    lastUsedAt: toIso(k.lastUsedAt) || null,
  };
};

// POST /keys/create { label, replace? } -> { key, hash, label }
// One active Grok key. { replace: true } revokes the current key in the same transaction.
// Keys that were already active before this rule stay valid until revoked or replaced.
app.post('/keys/create', wrap(async (req, res) => {
  const uid = await appUser(req);
  const body = req.body || {};
  const active = await db.collection('botKeys').where('uid', '==', uid).where('revoked', '==', false).get();
  const decision = decideKeyCreate({
    activeCount: active.size,
    replace: body.replace === true,
    botType: body.botType || 'grok',
  });
  if (!decision.ok) throw new HttpError(decision.status, decision.error);
  const label = String(body.label || 'Grok').trim().slice(0, 60) || 'Grok';
  const key = 'tl_' + crypto.randomBytes(32).toString('base64url');
  const hash = sha256(key);
  await db.runTransaction(async (tx) => {
    if (decision.revokeExisting) {
      active.docs.forEach((d) => {
        tx.update(d.ref, { revoked: true, revokedAt: FieldValue.serverTimestamp(), replacedBy: hash });
      });
    }
    tx.create(db.collection('botKeys').doc(hash), {
      uid,
      createdAt: FieldValue.serverTimestamp(),
      label,
      revoked: false,
      botType: 'grok',
    });
  });
  res.status(201).json({ key, hash, label, botType: 'grok', replaced: active.size });
}));

// POST /keys/list -> { keys: [{ hash, label, revoked, createdAt, lastUsedAt }] }
app.post('/keys/list', wrap(async (req, res) => {
  const uid = await appUser(req);
  const snap = await db.collection('botKeys').where('uid', '==', uid).get();
  res.json({ keys: snap.docs.map(keyView) });
}));

// POST /keys/revoke { hash } -> { hash, revoked: true }
app.post('/keys/revoke', wrap(async (req, res) => {
  const uid = await appUser(req);
  const hash = String((req.body && req.body.hash) || '');
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new HttpError(400, 'hash must be the 64-character SHA-256 of the key');
  const ref = db.collection('botKeys').doc(hash);
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== uid) throw new HttpError(404, 'Key not found');
  await ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp() });
  res.json({ hash, revoked: true });
}));

registerAdmin(app, { db, FieldValue, HttpError, wrap, toIso, getAuth });

// Every bot route needs a valid key; req.uid is the only user ever touched.
// Rate limit (429 + Retry-After) and the daily allowance (402) run before the handler.
app.use((req, res, next) => {
  authenticate(req)
    .then(async ({ uid, hash }) => {
      req.uid = uid;
      req.keyHash = hash;
      await guard.enforceRate(hash);
      await guard.enforceAllowance(uid, req.method);
      next();
    })
    .catch((e) => {
      const status = e.status || 500;
      if (e.retryAfter) res.set('Retry-After', String(e.retryAfter));
      const body = { error: status >= 500 ? 'Server error' : e.message };
      if (e.code) body.code = e.code;
      if (e.details && typeof e.details === 'object') Object.assign(body, e.details);
      if (status >= 500) console.error(e);
      res.status(status).json(body);
    });
});

// ---------- profile (read only) ----------

// GET /me/profile -> { displayName, dateOfBirth, dateOfBirthIso, username }
app.get('/me/profile', wrap(async (req, res) => {
  const snap = await db.collection('users').doc(req.uid).collection('settings').doc('profile').get();
  res.json(publicProfile(snap.exists ? snap.data() : {}));
}));

// POST /photos -> { eventId, storagePath, downloadUrl }
app.post('/photos', wrap(async (req, res) => {
  const image = await readImage(req);
  const eventId = image.eventId ? String(image.eventId) : newEventId();
  if (!validEventId(eventId)) throw new HttpError(400, 'Invalid eventId');
  const out = await storeImage(req.uid, eventId, image);
  res.status(201).json({ eventId, ...out });
}));

// POST /events -> created event + appLink/webLink
app.post('/events', wrap(async (req, res) => {
  const body = req.body || {};
  const fields = pickWritable(body);
  const kind = KINDS[String(body.kind || '').toLowerCase()];
  if (kind) {
    fields.source = fields.source || kind.source;
    fields.category = fields.category || kind.category;
    if (kind.hobbyType) fields.hobbyType = fields.hobbyType || kind.hobbyType;
  }
  if (!fields.title) throw new HttpError(400, 'title is required');

  let id = newEventId();
  if (body.id !== undefined) {
    if (!validEventId(String(body.id))) throw new HttpError(400, 'Invalid id');
    id = String(body.id); // e.g. the eventId returned by POST /photos
  }
  const ref = eventsCol(req.uid).doc(id);
  const existing = await ref.get();
  if (existing.exists && !existing.data().deleted) throw new HttpError(409, 'An event with this id already exists; use PATCH');

  if (body.imageBase64) {
    const { downloadUrl } = await storeImage(req.uid, id, decodeBase64Image(body.imageBase64, body.contentType));
    fields.imageUri = downloadUrl;
  }

  // Optional tickets / PDFs in the same call: attachments: [{ fileBase64, contentType, name }]
  let attachments;
  if (body.attachments !== undefined || body.fileBase64 || body.pdfBase64) {
    const list = body.attachments !== undefined ? body.attachments : [body];
    if (!Array.isArray(list)) throw new HttpError(400, 'attachments must be an array of { fileBase64, contentType, name }');
    if (list.length > MAX_ATTACHMENTS) throw new HttpError(400, `At most ${MAX_ATTACHMENTS} attachments`);
    attachments = [];
    for (const a of list) {
      const b64 = a && (a.fileBase64 || a.pdfBase64 || a.base64);
      if (!b64) throw new HttpError(400, 'Each attachment needs fileBase64 (+ contentType, name)');
      attachments.push(await storeAttachment(req.uid, id, decodeBase64File(b64, a.contentType, a.name || a.fileName), attachments));
    }
  }

  const now = new Date().toISOString();
  const event = stripUndefined({
    description: '',
    category: 'personal',
    labels: [],
    ...fields,
    id,
    date: fields.date || now,
    source: fields.source || 'manual',
    nextAction: fields.nextAction || 'none',
    createdAt: now,
    updatedAt: now,
    attachments,
    ownerUid: req.uid,
    addedBy: 'bot',
  });
  await ref.set(event);
  await bumpSync(req.uid, 'event:create', req);
  res.status(201).json(present(event, id));
}));

function notDeleted(data) {
  return !data || data.deleted !== true;
}

// GET /events?from=&to=&q=&label=&kind=&source=&limit=&cursor=
app.get('/events', wrap(async (req, res) => {
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to');
  const q = String(req.query.q || '').trim().toLowerCase();
  const label = String(req.query.label || '').trim().toLowerCase();
  const kind = String(req.query.kind || '').trim().toLowerCase();
  const source = String(req.query.source || '').trim().toLowerCase();
  if (kind && !FILTER_KINDS.includes(kind)) throw new HttpError(400, `kind must be one of: ${FILTER_KINDS.join(', ')}`);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_LIST);
  const scanning = !!(q || label || kind || source);
  const cursor = decodeCursor(req.query.cursor);

  let query = eventsCol(req.uid);
  if (from) query = query.where('date', '>=', from);
  if (to) query = query.where('date', '<=', to);
  // from/to are a real range query on `date`. Text filters then run inside that window.
  // orderBy(date) uses the automatic single-field index (no composite index).
  query = query.orderBy('date', 'desc');
  if (cursor && cursor.date) query = query.startAfter(cursor.date);
  query = query.limit(scanning ? SCAN_CAP : limit);

  const snap = await query.get();
  let events = snap.docs.map((d) => present(d.data(), d.id)).filter((e) => notDeleted(e));
  if (kind) events = events.filter((e) => matchesKind(e, kind));
  if (source) events = events.filter((e) => String(e.source || 'manual').toLowerCase() === source);
  if (label) {
    events = events.filter((e) => Array.isArray(e.labels) && e.labels.some((l) => String(l).toLowerCase() === label));
  }
  if (q) {
    events = events.filter((e) =>
      [e.title, e.description, e.location, e.placeName, e.photoNote, e.socialTitle, e.socialNote, e.botNote, ...(e.labels || [])]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(q)));
  }
  const page = events.slice(0, limit);
  const out = { count: page.length, total: events.length, events: page };
  if (scanning && snap.size >= SCAN_CAP) out.truncated = true;
  if (!scanning && snap.size === limit && snap.docs.length) {
    const last = snap.docs[snap.docs.length - 1];
    out.nextCursor = encodeCursor(String((last.data() || {}).date || ''), last.id);
  }
  res.json(out);
}));

// POST /sync/bump -> one write, to finish a batch done with ?nosync=1
app.post('/sync/bump', wrap(async (req, res) => {
  await bumpSync(req.uid, String((req.body && req.body.what) || 'batch').slice(0, 60));
  const snap = await db.collection('users').doc(req.uid).collection('meta').doc('sync').get();
  const data = snap.exists ? snap.data() : {};
  res.json({ bumped: true, version: data.version || null, lastChanged: toIso(data.lastChanged) || null });
}));

// GET /sync?since=&version=&limit=&cursor= -> only events changed since the last sync
app.get('/sync', wrap(async (req, res) => {
  const syncSnap = await db.collection('users').doc(req.uid).collection('meta').doc('sync').get();
  const sync = syncSnap.exists ? syncSnap.data() : {};
  const version = sync.version == null ? null : sync.version;
  const clientVersion = req.query.version;
  if (clientVersion != null && clientVersion !== '' && String(version) === String(clientVersion)) {
    return res.json({
      changed: false,
      version,
      lastChanged: toIso(sync.lastChanged) || null,
      count: 0,
      events: [],
    });
  }
  const since = parseDate(req.query.since, 'since');
  if (!since) throw new HttpError(400, 'Pass since (ISO) or version matching meta/sync');
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), MAX_LIST);
  const cursor = decodeCursor(req.query.cursor);
  let query = eventsCol(req.uid).where('updatedAt', '>', since).orderBy('updatedAt');
  if (cursor && cursor.date) query = query.startAfter(cursor.date);
  const snap = await query.limit(limit).get();
  const events = snap.docs.map((d) => present(d.data(), d.id));
  const out = {
    changed: true,
    version,
    lastChanged: toIso(sync.lastChanged) || null,
    count: events.length,
    events,
  };
  if (snap.size === limit && snap.docs.length) {
    const last = snap.docs[snap.docs.length - 1];
    out.nextCursor = encodeCursor(String((last.data() || {}).updatedAt || ''), last.id);
  }
  res.json(out);
}));

// GET /events/exists?id= | ?url= -> { exists, id } at 1 read. Tombstones count as not existing.
const URL_FIELDS = ['socialUrl', 'url', 'driveUrl', 'readingUrl', 'recipeUrl'];
app.get('/events/exists', wrap(async (req, res) => {
  const id = String(req.query.id || '').trim();
  const url = String(req.query.url || '').trim();
  if (!id && !url) throw new HttpError(400, 'Pass id or url');
  if (id) {
    if (!validEventId(id)) throw new HttpError(400, 'Invalid id');
    const snap = await eventsCol(req.uid).doc(id).get();
    const alive = snap.exists && notDeleted(snap.data());
    return res.json({ exists: alive, id: alive ? snap.id : null });
  }
  const fields = req.query.field && URL_FIELDS.includes(String(req.query.field)) ? [String(req.query.field)] : URL_FIELDS;
  for (const f of fields) {
    const snap = await eventsCol(req.uid).where(f, '==', url).limit(1).get();
    const hit = snap.docs.find((d) => notDeleted(d.data()));
    if (hit) return res.json({ exists: true, id: hit.id, field: f });
  }
  res.json({ exists: false, id: null });
}));

// GET /recap?year=2026 -> the whole year, paged with startAfter so one response is not capped at 50.
const RECAP_PAGE = 80;
const RECAP_MAX_PAGES = 40;
app.get('/recap', wrap(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  if (year < 1970 || year > 2100) throw new HttpError(400, 'year must be 1970-2100');
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const collected = [];
  let pages = 0;
  let cursor = null;
  let truncated = false;
  while (pages < RECAP_MAX_PAGES) {
    let query = eventsCol(req.uid)
      .where('date', '>=', start)
      .where('date', '<', end)
      .orderBy('date')
      .limit(RECAP_PAGE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    pages += 1;
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      if (data.deleted) return;
      collected.push({ id: d.id, ...data });
    });
    if (snap.size < RECAP_PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
    if (pages >= RECAP_MAX_PAGES) truncated = true;
  }
  const recap = foldEvents(year, collected, new Date());
  res.json({ ...recap, pages, truncated, scanned: collected.length });
}));

// GET /events/:id
app.get('/events/:id', wrap(async (req, res) => {
  if (!validEventId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const snap = await eventsCol(req.uid).doc(req.params.id).get();
  if (!snap.exists || !notDeleted(snap.data())) throw new HttpError(404, 'Not found');
  res.json(present(snap.data(), snap.id));
}));

// PATCH /events/:id
app.patch('/events/:id', wrap(async (req, res) => {
  if (!validEventId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const ref = eventsCol(req.uid).doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || !notDeleted(snap.data())) throw new HttpError(404, 'Not found');
  const fields = stripUndefined(pickWritable(req.body || {}));
  if (!Object.keys(fields).length) throw new HttpError(400, 'No editable fields in body');
  const update = { ...fields, updatedAt: new Date().toISOString(), ownerUid: req.uid };
  await ref.set(update, { merge: true });
  await bumpSync(req.uid, 'event:update', req);
  res.json(present({ ...snap.data(), ...update }, snap.id));
}));

// POST /events/:id/attachments -> { attachment, attachments }
app.post('/events/:id/attachments', wrap(async (req, res) => {
  if (!validEventId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const ref = eventsCol(req.uid).doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || !notDeleted(snap.data())) throw new HttpError(404, 'Not found');
  const existing = Array.isArray(snap.data().attachments) ? snap.data().attachments : [];
  const attachment = await storeAttachment(req.uid, snap.id, await readAttachment(req), existing);
  const attachments = [...existing, attachment];
  const updatedAt = new Date().toISOString();
  await ref.set({ attachments, updatedAt }, { merge: true });
  await bumpSync(req.uid, 'event:update', req);
  await syncSharedAttachments({ ...snap.data(), attachments, ownerUid: req.uid });
  res.status(201).json({ eventId: snap.id, attachment, attachments });
}));

// DELETE /events/:id/attachments/:name -> { attachments }
app.delete('/events/:id/attachments/:name', wrap(async (req, res) => {
  if (!validEventId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const ref = eventsCol(req.uid).doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || !notDeleted(snap.data())) throw new HttpError(404, 'Not found');
  const existing = Array.isArray(snap.data().attachments) ? snap.data().attachments : [];
  const hit = existing.find((a) => a && a.name === req.params.name);
  if (!hit) throw new HttpError(404, 'Attachment not found');
  if (hit.storagePath && hit.storagePath.startsWith(`users/${req.uid}/events/${snap.id}/`)) {
    await getStorage().bucket().file(hit.storagePath).delete({ ignoreNotFound: true });
  }
  const attachments = existing.filter((a) => a !== hit);
  await ref.set({ attachments, updatedAt: new Date().toISOString() }, { merge: true });
  await bumpSync(req.uid, 'event:update', req);
  await syncSharedAttachments({ ...snap.data(), attachments, ownerUid: req.uid });
  res.json({ eventId: snap.id, attachments });
}));

// ---------- share invites (mirrors src/services/shareService.js createEventShare) ----------

function makeInviteCode(length = 6) {
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return code;
}

function normalizeHandle(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
}

/** Server version of currentParticipantProfile(): cloud profile settings, then Auth record. */
async function ownerParticipant(uid) {
  let profile = {};
  try {
    const p = await db.collection('users').doc(uid).collection('settings').doc('profile').get();
    if (p.exists) profile = p.data() || {};
  } catch (_) { /* ignore */ }
  let user = {};
  try {
    user = await getAuth().getUser(uid);
  } catch (_) { /* ignore */ }
  const handle = normalizeHandle(profile.handle);
  const hasHandle = handle.length >= 3;
  const displayName = profile.displayName
    || (hasHandle ? `@${handle}` : '')
    || user.displayName
    || (user.email ? user.email.split('@')[0] : '')
    || 'Friend';
  const initial = (displayName || user.email || 'F').replace(/^@/, '').charAt(0).toUpperCase();
  return stripUndefined({
    uid,
    displayName,
    handle: hasHandle ? handle : undefined,
    email: hasHandle ? undefined : user.email || undefined,
    initial,
    colour: FRIEND_COLOUR,
  });
}

function inviteLinks(code) {
  const c = String(code || '').toUpperCase();
  return { link: `${APP_SCHEME}://share/${c}`, joinLink: `${APP_SCHEME}://join/${c}` };
}

function inviteView(d) {
  const v = d.data ? d.data() : d;
  const code = v.code || d.id;
  const expired = v.expiresAt && new Date(v.expiresAt).getTime() < Date.now();
  return {
    code,
    status: v.status === 'pending' && expired ? 'expired' : v.status,
    shareId: v.shareId,
    eventTitle: v.eventTitle,
    createdAt: toIso(v.createdAt),
    expiresAt: toIso(v.expiresAt),
    acceptedByUid: v.acceptedByUid,
    acceptedAt: toIso(v.acceptedAt),
    ...inviteLinks(code),
  };
}

// POST /events/:id/invite -> { code, link, joinLink, shareId, expiresAt, invite, howToAccept }
app.post('/events/:id/invite', wrap(async (req, res) => {
  if (!validEventId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const uid = req.uid;
  const ref = eventsCol(uid).doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || !notDeleted(snap.data())) throw new HttpError(404, 'Not found');
  const event = { ...snap.data(), id: snap.id };
  if (event.source === 'shared' || (event.sharedFrom && event.sharedFrom !== uid)) {
    throw new HttpError(409, 'This event was shared with you by a friend; only its creator can invite people');
  }

  const now = new Date();
  const expires = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  let code = makeInviteCode(6);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!(await db.collection('eventInvites').doc(code).get()).exists) break;
    code = makeInviteCode(6);
  }

  const me = await ownerParticipant(uid);
  let shareId = event.shareId || null;
  let shared = null;
  if (shareId) {
    const s = await db.collection('sharedEvents').doc(shareId).get();
    if (s.exists && s.data().createdByUid === uid) {
      shared = s.data();
      const patch = { updatedAt: now.toISOString() };
      if (!(shared.participantUids || []).includes(uid)) {
        patch.participantUids = FieldValue.arrayUnion(uid);
        patch[`participants.${uid}`] = me;
      }
      if (Array.isArray(event.attachments)) patch.attachments = event.attachments;
      await s.ref.update(patch);
    } else {
      shareId = null;
    }
  }
  if (!shareId) {
    shareId = `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    shared = stripUndefined({
      title: event.title || 'Shared event',
      description: event.description || '',
      date: toIso(event.date) || now.toISOString(),
      category: event.category || 'personal',
      createdByUid: uid,
      createdByName: me.displayName,
      createdByHandle: me.handle,
      createdByEmail: me.email,
      sourceEventId: event.id,
      participantUids: [uid],
      participants: { [uid]: me },
      status: 'active',
      colour: '#8b5cf6',
      attachments: Array.isArray(event.attachments) && event.attachments.length ? event.attachments : undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await db.collection('sharedEvents').doc(shareId).set(shared);
  }

  const invite = stripUndefined({
    shareId,
    fromUid: uid,
    fromName: me.displayName,
    fromHandle: me.handle,
    fromEmail: me.email,
    code,
    status: 'pending',
    eventTitle: (shared && shared.title) || event.title || 'Shared event',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    addedBy: 'bot',
  });
  await db.collection('eventInvites').doc(code).create(invite);

  await ref.set({
    shareId,
    isShared: true,
    sharedFrom: event.sharedFrom || uid,
    updatedAt: now.toISOString(),
  }, { merge: true });
  await bumpSync(req.uid, 'event:invite', req);

  res.status(201).json({
    eventId: event.id,
    shareId,
    code,
    ...inviteLinks(code),
    expiresAt: invite.expiresAt,
    invite: inviteView(invite),
    howToAccept: `Your friend opens the Timeline app, goes to Accept Invite and types the code ${code}, scans the QR for ${inviteLinks(code).link}, or taps that link on their phone. The code works once and expires in ${INVITE_DAYS} days.`,
  });
}));

// GET /events/:id/invites -> { shareId, invites: [...] }
app.get('/events/:id/invites', wrap(async (req, res) => {
  if (!validEventId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const snap = await eventsCol(req.uid).doc(req.params.id).get();
  if (!snap.exists) throw new HttpError(404, 'Not found');
  const shareId = snap.data().shareId;
  if (!shareId) return res.json({ eventId: snap.id, shareId: null, invites: [] });
  const q = await db.collection('eventInvites').where('shareId', '==', shareId).get();
  const invites = q.docs
    .filter((d) => d.data().fromUid === req.uid)
    .map(inviteView)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json({ eventId: snap.id, shareId, invites });
}));

// DELETE /events/:id -> bot-added events delete at once. Events the user made need a two-step confirm:
// the first call returns 409 { needsConfirm, confirmToken, expiresAt }; repeat with ?confirm=TOKEN (single use, 5 min,
// this event only). Removes its files, pending invites, and a share nobody joined. User deletes are audited.
const CONFIRM_MS = 5 * 60 * 1000;
const confirmCol = (uid) => db.collection('users').doc(uid).collection('botConfirm');
app.delete('/events/:id', wrap(async (req, res) => {
  if (!validEventId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const ref = eventsCol(req.uid).doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Not found');
  const event = snap.data();
  const userMade = event.addedBy !== 'bot';
  if (userMade) {
    const token = String(req.query.confirm || '').trim().toUpperCase();
    if (!token) {
      let sharedInvites = 0;
      if (event.shareId) {
        const inv = await db.collection('eventInvites').where('shareId', '==', event.shareId).get();
        sharedInvites = inv.docs.filter((d) => d.data().fromUid === req.uid).length;
      }
      const confirmToken = makeInviteCode(8);
      const expiresAt = new Date(Date.now() + CONFIRM_MS).toISOString();
      await confirmCol(req.uid).doc(sha256(confirmToken)).set({
        eventId: snap.id, title: event.title || '', createdAt: new Date().toISOString(), expiresAt, used: false,
      });
      return res.status(409).json({
        needsConfirm: true,
        confirmToken,
        expiresAt,
        event: { id: snap.id, title: event.title || '', date: toIso(event.date) || null },
        sharedInvites,
        message: 'This event was made by the user. Ask them to confirm, then repeat DELETE with ?confirm=TOKEN within 5 minutes.',
      });
    }
    const tokRef = confirmCol(req.uid).doc(sha256(token));
    await db.runTransaction(async (tx) => {
      const t = await tx.get(tokRef);
      const v = t.exists ? t.data() : null;
      if (!v || v.eventId !== snap.id) throw new HttpError(403, 'Invalid confirm token for this event');
      if (v.used) throw new HttpError(403, 'Confirm token already used');
      if (new Date(v.expiresAt).getTime() < Date.now()) throw new HttpError(403, 'Confirm token expired; request a new one');
      tx.update(tokRef, { used: true, usedAt: new Date().toISOString() });
    });
  }
  const removed = { files: 0, invites: 0, sharedEvent: false };
  const [files] = await getStorage().bucket().getFiles({ prefix: `users/${req.uid}/events/${snap.id}/` });
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
  removed.files = files.length;
  if (event.shareId) {
    const s = await db.collection('sharedEvents').doc(event.shareId).get();
    if (s.exists && s.data().createdByUid === req.uid) {
      const inv = await db.collection('eventInvites').where('shareId', '==', event.shareId).get();
      for (const d of inv.docs) {
        if (d.data().fromUid === req.uid && d.data().status === 'pending') {
          await d.ref.delete();
          removed.invites += 1;
        }
      }
      const others = (s.data().participantUids || []).filter((u) => u !== req.uid);
      if (!others.length) {
        await s.ref.delete();
        removed.sharedEvent = true;
      }
    }
  }
  const nowIso = new Date().toISOString();
  await ref.set(tombstone({ ...event, id: snap.id, ownerUid: req.uid }, nowIso), { merge: true });
  await bumpSync(req.uid, 'event:delete', req);
  if (userMade) {
    await db.collection('users').doc(req.uid).collection('botAudit').add({
      action: 'delete-user-event', by: 'bot', uid: req.uid, eventId: snap.id, title: event.title || '',
      date: toIso(event.date) || null, removed, at: new Date().toISOString(),
    });
  }
  res.json({ deleted: snap.id, title: event.title || '', confirmed: userMade, removed });
}));

// ---------- To-dos (mirrors src/services/todoService.js; keep in sync) ----------
// users/{uid}/settings/todos -> { items: [row], updatedAt }, newest first.

const todosDoc = (uid) => db.collection('users').doc(uid).collection('settings').doc('todos');

/** Same id format as todoService.newId (base36 time + 6 chars). */
const newTodoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Same as todoService.cleanItem. */
function cleanTodo(raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(row.id || newTodoId()),
    title: String(row.title || '').trim(),
    note: String(row.note || '').trim(),
    category: String(row.category || 'personal'),
    date: String(row.date || '').slice(0, 10),
    createdAt: row.createdAt || new Date().toISOString(),
    doneAt: row.doneAt || '',
    eventId: row.eventId || '',
  };
}

function todoDate(value) {
  if (value === undefined || value === null || value === '') return '';
  const d = parseDate(value, 'date');
  return d.slice(0, 10);
}

function todoFields(body, { requireTitle }) {
  const out = {};
  if (body.title !== undefined || requireTitle) {
    const title = String(body.title || '').trim();
    if (!title) throw new HttpError(400, 'title is required');
    out.title = title.slice(0, 300);
  }
  if (body.note !== undefined) out.note = String(body.note || '').trim().slice(0, 5000);
  if (body.category !== undefined) out.category = String(body.category || 'personal').trim() || 'personal';
  if (body.date !== undefined) out.date = todoDate(body.date);
  return out;
}

const londonDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

async function readTodos(tx, uid) {
  const ref = todosDoc(uid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const items = snap.exists && Array.isArray(snap.data().items)
    ? snap.data().items.map(cleanTodo).filter((r) => r.title)
    : [];
  return { ref, items };
}

// GET /todos?status=open|done|all -> { count, open: [...], done: [...] }
app.get('/todos', wrap(async (req, res) => {
  const status = String(req.query.status || 'all').toLowerCase();
  if (!['open', 'done', 'all'].includes(status)) throw new HttpError(400, 'status must be open, done or all');
  const { items } = await readTodos(null, req.uid);
  const open = status === 'done' ? [] : items.filter((r) => !r.doneAt);
  const done = status === 'open' ? [] : items.filter((r) => r.doneAt);
  res.json({ status, count: open.length + done.length, open, done });
}));

// POST /todos { title, note?, category?, date? } -> 201 { todo }
app.post('/todos', wrap(async (req, res) => {
  const fields = todoFields(req.body || {}, { requireTitle: true });
  const todo = await db.runTransaction(async (tx) => {
    const { ref, items } = await readTodos(tx, req.uid);
    if (items.length >= 1000) throw new HttpError(409, 'The to-do list is full (1000 items)');
    const row = cleanTodo({ id: newTodoId(), ...fields, category: fields.category || 'personal', createdAt: new Date().toISOString() });
    tx.set(ref, { items: [row, ...items], updatedAt: new Date().toISOString() });
    return row;
  });
  await bumpSync(req.uid, 'todo:create', req);
  res.status(201).json({ todo });
}));

// PATCH /todos/:id { title?, note?, category?, date?, done?: true|false } -> { todo, event?, eventRemoved? }
app.patch('/todos/:id', wrap(async (req, res) => {
  const body = req.body || {};
  const fields = todoFields(body, { requireTitle: false });
  if (body.done !== undefined && typeof body.done !== 'boolean') throw new HttpError(400, 'done must be true or false');
  if (!Object.keys(fields).length && body.done === undefined) throw new HttpError(400, 'Nothing to change');
  const id = String(req.params.id);
  const out = await db.runTransaction(async (tx) => {
    const { ref, items } = await readTodos(tx, req.uid);
    const index = items.findIndex((r) => r.id === id);
    if (index === -1) throw new HttpError(404, 'To-do not found');
    let row = cleanTodo({ ...items[index], ...fields });
    const result = {};
    const nowIso = new Date().toISOString();
    if (body.done === true && !row.doneAt) {
      // Same as todoService.completeTodo: the line becomes a timeline event (source todo).
      const eventId = newTodoId();
      const event = stripUndefined({
        id: eventId,
        title: row.title,
        description: row.note,
        date: row.date || londonDay(), // app passes row.date as is; API fills today when blank
        category: row.category || 'personal',
        labels: [],
        source: 'todo',
        fromTodo: true,
        nextAction: 'none',
        createdAt: nowIso,
        updatedAt: nowIso,
        ownerUid: req.uid,
        addedBy: 'bot',
      });
      tx.set(eventsCol(req.uid).doc(eventId), event);
      row = { ...row, doneAt: nowIso, eventId };
      result.event = present(event, eventId);
    } else if (body.done === false && row.doneAt) {
      // The app has no "undo"; the API reopens the line and removes the event only if the API made it.
      if (row.eventId && validEventId(row.eventId)) {
        const evRef = eventsCol(req.uid).doc(row.eventId);
        const ev = await tx.get(evRef);
        if (ev.exists && ev.data().addedBy === 'bot' && ev.data().fromTodo && !ev.data().deleted) {
          tx.set(evRef, tombstone({ ...ev.data(), id: ev.id, ownerUid: req.uid }, nowIso), { merge: true });
          result.eventRemoved = row.eventId;
        } else if (ev.exists) {
          result.eventKept = row.eventId;
        }
      }
      row = { ...row, doneAt: '', eventId: '' };
    }
    const next = items.slice();
    next[index] = row;
    tx.set(ref, { items: next, updatedAt: nowIso });
    return { todo: row, ...result };
  });
  await bumpSync(req.uid, 'todo:update', req);
  res.json(out);
}));

// DELETE /todos/:id -> { deleted } (like todoService.removeTodo; a linked event stays on the timeline)
app.delete('/todos/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  await db.runTransaction(async (tx) => {
    const { ref, items } = await readTodos(tx, req.uid);
    if (!items.some((r) => r.id === id)) throw new HttpError(404, 'To-do not found');
    tx.set(ref, { items: items.filter((r) => r.id !== id), updatedAt: new Date().toISOString() });
  });
  await bumpSync(req.uid, 'todo:delete', req);
  res.json({ deleted: id });
}));

// ---------- Word to Int (ported verbatim from src/services/wordToIntService.js; keep in sync) ----------

function lettersOnly(text) {
  return (text || '').toUpperCase().replace(/[^A-Z]/g, '');
}
function ordinalValue(ch) {
  return ch.charCodeAt(0) - 64; // A=1 ... Z=26
}
function pythagoreanValue(ch) {
  const n = ordinalValue(ch);
  return ((n - 1) % 9) + 1; // A=1 ... I=9, J=1 ...
}
function reverseOrdinalValue(ch) {
  return 27 - ordinalValue(ch); // A=26 ... Z=1
}
function reduceNumber(n) {
  let value = Math.abs(Number(n));
  const steps = [value];
  while (value > 9 && value !== 11 && value !== 22 && value !== 33) {
    value = String(value).split('').reduce((sum, d) => sum + Number(d), 0);
    steps.push(value);
  }
  return { value, steps };
}
function legalReducedValue(n) {
  return (n >= 1 && n <= 9) || n === 11 || n === 22 || n === 33;
}
/** Java String.hashCode on the trimmed original phrase. */
function javaHashCode(text) {
  const s = String(text ?? '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
  return hash;
}
function convertPhrase(phrase) {
  const raw = (phrase || '').trim();
  const letters = lettersOnly(raw);
  const breakdown = letters.split('').map((ch) => ({
    letter: ch,
    ordinal: ordinalValue(ch),
    pythagorean: pythagoreanValue(ch),
    reverse: reverseOrdinalValue(ch),
  }));
  const ordinal = breakdown.reduce((s, b) => s + b.ordinal, 0);
  const pythagorean = breakdown.reduce((s, b) => s + b.pythagorean, 0);
  const reverse = breakdown.reduce((s, b) => s + b.reverse, 0);
  return {
    phrase: raw,
    letters,
    letterCount: letters.length,
    wordCount: raw ? raw.split(/\s+/).filter(Boolean).length : 0,
    breakdown,
    ordinal,
    pythagorean,
    reverse,
    hashCode: javaHashCode(raw),
    reducedOrdinal: reduceNumber(ordinal),
    reducedPythagorean: reduceNumber(pythagorean),
    reducedReverse: reduceNumber(reverse),
  };
}
function phraseKey(phrase) {
  return String(phrase || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function findSavedPhrase(list, phrase) {
  const key = phraseKey(phrase);
  if (!key) return null;
  const letters = key.replace(/[^a-z]/g, '');
  return list.find((item) => {
    const itemKey = phraseKey(item?.phrase);
    if (itemKey === key) return true;
    const itemLetters = itemKey.replace(/[^a-z]/g, '');
    return !!(letters && itemLetters === letters);
  }) || null;
}
function asNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    if (value.value != null && !Number.isNaN(Number(value.value))) return Number(value.value);
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
function entryHashCode(entry) {
  if (entry.hashCode != null && !Number.isNaN(Number(entry.hashCode))) return Number(entry.hashCode);
  return javaHashCode(entry.phrase || '');
}
function hashHit(entry, n) {
  const hash = entryHashCode(entry);
  return hash === n || (hash != null && Math.abs(hash) === Math.abs(n));
}
/** Same matching as the app's findPhrasesForNumber. */
function wordHits(entry, n, method, reducedTo) {
  if (method === 'ordinal') return entry.ordinal === n ? ['ordinal'] : [];
  if (method === 'pythagorean') return entry.pythagorean === n ? ['pythagorean'] : [];
  if (method === 'reverse') return entry.reverse === n ? ['reverse'] : [];
  if (method === 'reduced') return asNumber(entry.reduced) === reducedTo ? ['reduced'] : [];
  if (method === 'hashcode') return hashHit(entry, n) ? ['hashcode'] : [];
  const hits = [];
  if (entry.ordinal === n) hits.push('ordinal');
  if (entry.pythagorean === n) hits.push('pythagorean');
  if (entry.reverse === n) hits.push('reverse');
  if (legalReducedValue(n) && asNumber(entry.reduced) === n) hits.push('reduced');
  if (hashHit(entry, n)) hits.push('hashcode');
  return hits;
}

const CIPHER_ALIASES = {
  ordinal: 'ordinal', englishordinal: 'ordinal', simple: 'ordinal', englishsimple: 'ordinal',
  pythagorean: 'pythagorean', fullreduction: 'pythagorean', englishfullreduction: 'pythagorean',
  reverse: 'reverse', reverseordinal: 'reverse', englishreverse: 'reverse', englishreverseordinal: 'reverse',
  reduced: 'reduced', reducedordinal: 'reduced',
  hashcode: 'hashcode', javahashcode: 'hashcode',
  all: 'all',
};
function parseCipher(value) {
  if (value === undefined || value === '') return 'ordinal';
  const m = CIPHER_ALIASES[String(value).toLowerCase().replace(/[^a-z]/g, '')];
  if (!m) throw new HttpError(400, 'cipher must be one of: ordinal (English Ordinal), pythagorean (Full Reduction), reverse, reduced, hashcode, all');
  return m;
}

function wordText(body) {
  const text = String((body && (body.text ?? body.phrase)) || '').trim();
  if (!text) throw new HttpError(400, 'text is required');
  if (text.length > 500) throw new HttpError(400, 'text must be 500 characters or fewer');
  return text;
}
function wordValues(r) {
  return {
    phrase: r.phrase,
    letters: r.letters,
    letterCount: r.letterCount,
    wordCount: r.wordCount,
    ordinal: r.ordinal,
    pythagorean: r.pythagorean,
    reverse: r.reverse,
    reduced: r.reducedOrdinal.value,
    reducedSteps: r.reducedOrdinal.steps,
    reducedPythagorean: r.reducedPythagorean.value,
    reducedReverse: r.reducedReverse.value,
    hashCode: r.hashCode,
    breakdown: r.breakdown,
  };
}
const wordsCol = (uid) => db.collection('users').doc(uid).collection('wordNumbers');
// Per-instance cache: one full read per uid per 5 min instead of per call. Invalidated by this API's own word writes.
const WORDS_TTL_MS = 5 * 60 * 1000;
const wordsCache = new Map();
async function allWords(uid) {
  const hit = wordsCache.get(uid);
  if (hit && Date.now() - hit.at < WORDS_TTL_MS) return hit.list;
  const snap = await wordsCol(uid).limit(5000).get();
  const list = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((row) => !row.deleted);
  wordsCache.set(uid, { at: Date.now(), list });
  return list;
}

// POST /words/calc {text} -> values, no write
app.post('/words/calc', wrap(async (req, res) => {
  const r = convertPhrase(wordText(req.body));
  if (!r.letters) throw new HttpError(400, 'text has no letters A-Z');
  const list = await allWords(req.uid);
  const saved = findSavedPhrase(list, r.phrase);
  res.json({ values: wordValues(r), saved: saved || null });
}));

// POST /words {text, notes?, preferred?} -> saves in the app's wordNumbers shape
app.post('/words', wrap(async (req, res) => {
  const body = req.body || {};
  const r = convertPhrase(wordText(body));
  if (!r.letters) throw new HttpError(400, 'text has no letters A-Z');
  const list = await allWords(req.uid);
  const existing = findSavedPhrase(list, r.phrase);
  if (existing) return res.json({ existing: true, word: existing, values: wordValues(convertPhrase(existing.phrase)) });
  let preferred = 'ordinal';
  if (body.preferred !== undefined) {
    preferred = parseCipher(body.preferred);
    if (preferred === 'all') throw new HttpError(400, 'preferred cannot be all');
  }
  const now = new Date().toISOString();
  const word = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phrase: r.phrase,
    notes: String(body.notes || '').trim().slice(0, 5000),
    preferred,
    ordinal: r.ordinal,
    pythagorean: r.pythagorean,
    reverse: r.reverse,
    reduced: r.reducedOrdinal.value,
    hashCode: r.hashCode,
    letterCount: r.letterCount,
    createdAt: now,
    updatedAt: now,
    ownerUid: req.uid,
    addedBy: 'bot',
  };
  await wordsCol(req.uid).doc(word.id).set(word);
  wordsCache.delete(req.uid);
  await bumpSync(req.uid, 'word:create', req);
  res.status(201).json({ existing: false, word, values: wordValues(r) });
}));

// GET /words?cipher=&value=&limit=  |  GET /words?q=&limit=  |  GET /words (newest first)
app.get('/words', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_LIST);
  const list = await allWords(req.uid);
  const total = list.length;
  const rawValue = req.query.value;
  const q = String(req.query.q || '').trim();
  if (rawValue !== undefined && String(rawValue).trim() !== '') {
    const n = Number(String(rawValue).trim());
    if (Number.isNaN(n)) throw new HttpError(400, 'value must be a number');
    const cipher = parseCipher(req.query.cipher);
    const reducedTo = cipher === 'reduced' ? reduceNumber(n).value : null;
    const exclude = String(req.query.exclude || '').trim();
    const rows = [];
    list.forEach((entry) => {
      if (exclude && findSavedPhrase([entry], exclude)) return;
      const hits = wordHits(entry, n, cipher, reducedTo);
      if (hits.length) rows.push({ ...entry, matchOn: hits });
    });
    rows.sort((a, b) => phraseKey(a.phrase).localeCompare(phraseKey(b.phrase))
      || String(a.phrase || '').localeCompare(String(b.phrase || '')));
    return res.json({ cipher, value: n, reducedTo: reducedTo ?? undefined, total, count: Math.min(rows.length, limit), words: rows.slice(0, limit) });
  }
  let rows = list;
  if (q) {
    const key = phraseKey(q);
    rows = list.filter((e) => phraseKey(e.phrase).includes(key) || String(e.notes || '').toLowerCase().includes(key));
  }
  rows.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  res.json({ q: q || undefined, total, count: Math.min(rows.length, limit), words: rows.slice(0, limit) });
}));

app.use((_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

// cpu: 1 is required for concurrency > 1 (fractional CPU forces concurrency 1,
// which with few instances caused "no available instance" / 429 Rate exceeded).
exports.api = onRequest(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
    cpu: 1,
    concurrency: 80,
    minInstances: 0,
    maxInstances: 20,
  },
  app,
);
