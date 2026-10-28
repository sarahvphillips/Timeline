/**
 * Admin API. Registered before the bot-key middleware.
 * Auth is an admin key (adminKeys/{sha256}) OR a Firebase ID token for Sarah
 * or an email on app/staff.admins. Every mutation appends to adminLog.
 */
const crypto = require('crypto');
const { ukDay, nextMidnight } = require('./lib/ukTime');
const { pointsFor, allowanceCap, DEFAULT_RULES } = require('./lib/allowance');

const OWNER_EMAIL = 'sarah.v.phillips@googlemail.com';
const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function registerAdmin(app, ctx) {
  const { db, FieldValue, HttpError, wrap, toIso, getAuth } = ctx;
  let staffCache = { at: 0, emails: [] };

  async function staffEmails() {
    if (Date.now() - staffCache.at < 60 * 1000) return staffCache.emails;
    try {
      const snap = await db.collection('app').doc('staff').get();
      const list = snap.exists && Array.isArray(snap.data().admins) ? snap.data().admins : [];
      staffCache = {
        at: Date.now(),
        emails: list.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean),
      };
    } catch (_) {
      staffCache = { at: Date.now(), emails: staffCache.emails || [] };
    }
    return staffCache.emails;
  }

  function isOwner(email) {
    return String(email || '').trim().toLowerCase() === OWNER_EMAIL;
  }

  async function isAdminEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return false;
    if (isOwner(e)) return true;
    const list = await staffEmails();
    return list.includes(e);
  }

  async function requireAdmin(req) {
    const header = String(req.get('authorization') || '');
    const m = header.match(/^Bearer\s+(\S+)$/i);
    if (!m) throw new HttpError(401, 'Missing admin credentials');
    const token = m[1];
    if (token.startsWith('tla_')) {
      const snap = await db.collection('adminKeys').doc(sha256(token)).get();
      if (!snap.exists) throw new HttpError(401, 'Unknown admin key');
      const row = snap.data() || {};
      if (row.revoked || !(await isAdminEmail(row.email))) throw new HttpError(401, 'Admin key revoked');
      const actor = { email: String(row.email || '').toLowerCase(), uid: row.uid || '', via: 'admin-key', hash: snap.id };
      req.admin = actor;
      return actor;
    }
    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch (_) {
      throw new HttpError(401, 'Invalid or expired sign-in token');
    }
    const email = String(decoded.email || '').toLowerCase();
    if (!(await isAdminEmail(email))) throw new HttpError(403, 'Admin only');
    const actor = { email, uid: decoded.uid, via: 'app' };
    req.admin = actor;
    return actor;
  }

  async function logAction(actor, action, detail) {
    const row = {
      action: String(action || '').slice(0, 80),
      detail: detail && typeof detail === 'object' ? detail : { note: String(detail || '').slice(0, 500) },
      by: actor.email,
      byUid: actor.uid || '',
      via: actor.via,
      at: new Date().toISOString(),
    };
    await db.collection('adminLog').add(row);
    return row;
  }

  async function userByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) throw new HttpError(400, 'email is required');
    try {
      return await getAuth().getUserByEmail(e);
    } catch (_) {
      throw new HttpError(404, 'No Timeline account for that email');
    }
  }

  async function resolveUid(req) {
    if (req.params && req.params.uid && req.params.uid !== 'lookup') return String(req.params.uid);
    if (req.query && req.query.uid) return String(req.query.uid);
    if (req.query && req.query.email) return (await userByEmail(req.query.email)).uid;
    const body = req.body || {};
    if (body.uid) return String(body.uid);
    if (body.email) return (await userByEmail(body.email)).uid;
    throw new HttpError(400, 'Pass uid or email');
  }

  app.post('/admin/keys/create', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    if (actor.via !== 'app') throw new HttpError(403, 'Create an admin key from the app while signed in as an admin');
    const key = `tla_${crypto.randomBytes(32).toString('base64url')}`;
    const hash = sha256(key);
    await db.collection('adminKeys').doc(hash).create({
      uid: actor.uid,
      email: actor.email,
      createdAt: FieldValue.serverTimestamp(),
      label: String((req.body && req.body.label) || 'Admin bot').slice(0, 60),
      revoked: false,
    });
    await logAction(actor, 'admin-key-create', { hash, label: String((req.body && req.body.label) || 'Admin bot').slice(0, 60) });
    res.status(201).json({ key, hash, label: String((req.body && req.body.label) || 'Admin bot').slice(0, 60) });
  }));

  app.post('/admin/keys/revoke', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const hash = String((req.body && req.body.hash) || '');
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new HttpError(400, 'hash must be the 64-character SHA-256 of the admin key');
    const ref = db.collection('adminKeys').doc(hash);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Admin key not found');
    await ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedBy: actor.email });
    await logAction(actor, 'admin-key-revoke', { hash });
    res.json({ hash, revoked: true });
  }));

  app.get('/admin/usage-rules', wrap(async (req, res) => {
    await requireAdmin(req);
    const snap = await db.collection('config').doc('usageRules').get();
    res.json({ rules: { ...DEFAULT_RULES, ...(snap.exists ? snap.data() : {}) } });
  }));

  app.patch('/admin/usage-rules', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const body = req.body || {};
    const patch = {};
    if (body.dailyAllowance != null) patch.dailyAllowance = Math.max(1, Number(body.dailyAllowance) || DEFAULT_RULES.dailyAllowance);
    ['wR', 'wW', 'wD', 'adUnlockPoints'].forEach((k) => {
      if (body[k] != null) patch[k] = Number(body[k]);
    });
    if (body.resetTz) patch.resetTz = String(body.resetTz).slice(0, 60);
    if (body.actions && typeof body.actions === 'object') patch.actions = body.actions;
    patch.version = Date.now();
    patch.updatedAt = new Date().toISOString();
    patch.updatedBy = actor.email;
    await db.collection('config').doc('usageRules').set(patch, { merge: true });
    await logAction(actor, 'usage-rules-update', patch);
    const snap = await db.collection('config').doc('usageRules').get();
    res.json({ rules: { ...DEFAULT_RULES, ...(snap.data() || {}) } });
  }));

  app.get('/admin/lookup', wrap(async (req, res) => {
    await requireAdmin(req);
    const user = await userByEmail(req.query.email);
    res.json({ uid: user.uid, email: user.email || String(req.query.email || '').trim().toLowerCase() });
  }));

  app.get('/admin/users/:uid/limits', wrap(async (req, res) => {
    await requireAdmin(req);
    const uid = await resolveUid(req);
    const [usageSnap, botSnap, entSnap, rulesSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('meta').doc('usage').get(),
      db.collection('users').doc(uid).collection('meta').doc('botUsage').get(),
      db.collection('users').doc(uid).collection('entitlements').doc('main').get(),
      db.collection('config').doc('usageRules').get(),
    ]);
    const rules = { ...DEFAULT_RULES, ...(rulesSnap.exists ? rulesSnap.data() : {}) };
    const usage = usageSnap.exists ? usageSnap.data() : {};
    const botUsage = botSnap.exists ? botSnap.data() : {};
    const entitlements = entSnap.exists ? entSnap.data() : {};
    const day = ukDay(new Date(), rules.resetTz || 'Europe/London');
    const botPoints = botUsage.date === day ? Number(botUsage.points) || 0 : 0;
    const cap = allowanceCap(rules, entitlements, usage);
    res.json({
      uid,
      date: day,
      allowance: cap === Infinity ? null : cap,
      exempt: cap === Infinity,
      botPoints,
      usage,
      botUsage,
      entitlements,
      rules: { dailyAllowance: rules.dailyAllowance, adUnlockPoints: rules.adUnlockPoints, resetTz: rules.resetTz },
    });
  }));

  app.patch('/admin/users/:uid/limits', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const uid = await resolveUid(req);
    const body = req.body || {};
    const ent = { updatedAt: new Date().toISOString(), updatedBy: actor.email };
    if (body.dailyAllowance != null) ent.dailyAllowance = Math.max(0, Number(body.dailyAllowance) || 0);
    if (body.premium != null) ent.premium = !!body.premium;
    if (body.allowanceExempt != null) ent.allowanceExempt = !!body.allowanceExempt;
    if (body.testAccount != null) ent.testAccount = !!body.testAccount;
    await db.collection('users').doc(uid).collection('entitlements').doc('main').set(ent, { merge: true });
    if (body.adsUnlocked != null) {
      const n = Math.max(0, Number(body.adsUnlocked) || 0);
      await db.collection('users').doc(uid).collection('meta').doc('usage').set({
        adsUnlocked: n,
        unlocksUpdatedAt: new Date().toISOString(),
        unlocksUpdatedBy: actor.email,
      }, { merge: true });
    }
    await logAction(actor, 'user-limits-update', { uid, ...body, adsUnlocked: body.adsUnlocked });
    res.json({ uid, entitlements: ent, adsUnlocked: body.adsUnlocked != null ? Math.max(0, Number(body.adsUnlocked) || 0) : undefined });
  }));

  app.get('/admin/users/:uid/keys', wrap(async (req, res) => {
    await requireAdmin(req);
    const uid = await resolveUid(req);
    const snap = await db.collection('botKeys').where('uid', '==', uid).get();
    const keys = snap.docs.map((d) => {
      const k = d.data() || {};
      return {
        hash: d.id,
        label: k.label || '',
        revoked: !!k.revoked,
        botType: k.botType || '',
        createdAt: toIso(k.createdAt) || null,
        lastUsedAt: toIso(k.lastUsedAt) || null,
      };
    });
    res.json({ uid, keys });
  }));

  app.post('/admin/users/:uid/keys/revoke', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const uid = await resolveUid(req);
    const hash = String((req.body && req.body.hash) || '');
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new HttpError(400, 'hash must be the 64-character SHA-256 of the key');
    const ref = db.collection('botKeys').doc(hash);
    const snap = await ref.get();
    if (!snap.exists || snap.data().uid !== uid) throw new HttpError(404, 'Key not found for that user');
    await ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedBy: actor.email });
    await logAction(actor, 'bot-key-revoke', { uid, hash });
    res.json({ uid, hash, revoked: true });
  }));

  app.get('/admin/tickets', wrap(async (req, res) => {
    await requireAdmin(req);
    const status = String(req.query.status || '').trim();
    if (status && !TICKET_STATUSES.includes(status)) throw new HttpError(400, `status must be one of: ${TICKET_STATUSES.join(', ')}`);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const snap = await db.collection('tickets').orderBy('createdAt', 'desc').limit(status ? 100 : limit).get();
    let tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (status) tickets = tickets.filter((row) => row.status === status).slice(0, limit);
    res.json({ count: tickets.length, tickets });
  }));

  app.patch('/admin/tickets/:id', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const ref = db.collection('tickets').doc(String(req.params.id));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Ticket not found');
    const body = req.body || {};
    const patch = { updatedAt: new Date().toISOString(), updatedBy: actor.email };
    if (body.status != null) {
      if (!TICKET_STATUSES.includes(body.status)) throw new HttpError(400, `status must be one of: ${TICKET_STATUSES.join(', ')}`);
      patch.status = body.status;
      if (body.status === 'closed' || body.status === 'resolved') patch.closedAt = patch.updatedAt;
    }
    if (body.note != null) patch.adminNote = String(body.note).slice(0, 5000);
    if (body.draftEmail != null) {
      patch.draftEmail = String(body.draftEmail).slice(0, 8000);
      patch.draftEmailUpdatedAt = patch.updatedAt;
    }
    if (Object.keys(patch).length <= 2) throw new HttpError(400, 'Nothing to change');
    await ref.set(patch, { merge: true });
    await logAction(actor, 'ticket-update', { id: snap.id, status: patch.status || snap.data().status, draftEmail: body.draftEmail != null });
    res.json({ id: snap.id, ...snap.data(), ...patch });
  }));

  app.get('/admin/log', wrap(async (req, res) => {
    await requireAdmin(req);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const snap = await db.collection('adminLog').orderBy('at', 'desc').limit(limit).get();
    res.json({ count: snap.size, entries: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  }));

  app.post('/admin/allowance-test', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const uid = await resolveUid(req);
    const entSnap = await db.collection('users').doc(uid).collection('entitlements').doc('main').get();
    const ent = entSnap.exists ? entSnap.data() : {};
    if (ent.testAccount !== true) {
      throw new HttpError(403, 'Refusing to run the allowance test on a real account. Set entitlements.testAccount on a test user first.');
    }
    const rulesSnap = await db.collection('config').doc('usageRules').get();
    const rules = { ...DEFAULT_RULES, ...(rulesSnap.exists ? rulesSnap.data() : {}) };
    const samples = ['read', 'write', 'delete'];
    const costs = {};
    samples.forEach((name) => { costs[name] = pointsFor(name, rules); });
    const cap = allowanceCap(rules, ent, { adsUnlocked: 0 });
    await logAction(actor, 'allowance-test', { uid, cap: cap === Infinity ? null : cap });
    const reset = nextMidnight(new Date(), rules.resetTz || 'Europe/London');
    res.json({
      uid,
      testAccount: true,
      wroteUsage: false,
      costs,
      allowance: cap === Infinity ? null : cap,
      resetsAt: reset.resetsAt,
      note: 'Dry run only. No usage document was written.',
    });
  }));

  app.post('/admin/users/:uid/word-index/rebuild', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const uid = String(req.params.uid || '');
    if (!uid) throw new HttpError(400, 'uid is required');
    if (typeof ctx.rebuildWordIndex !== 'function') throw new HttpError(500, 'Word index rebuild is not available');
    const out = await ctx.rebuildWordIndex(uid);
    if (!out.ok) throw new HttpError(out.status || 409, out.error || 'Could not rebuild the word index');
    await logAction(actor, 'word-index-rebuild', { uid, count: out.count, reads: out.reads });
    res.json(out);
  }));
}

module.exports = { registerAdmin, OWNER_EMAIL, TICKET_STATUSES };
