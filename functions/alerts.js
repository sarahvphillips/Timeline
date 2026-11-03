const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { getAuth } = require('firebase-admin/auth');
const { ukDay } = require('./lib/ukTime');
const { computeAllowance } = require('./lib/allowanceBudget');
const {
  accountEntry,
  changedFields,
  directoryWithinLimit,
  duplicateGroups,
  maskEmail,
  postDiscord,
} = require('./lib/discord');

const signupHook = defineSecret('DISCORD_WEBHOOK_NEW_USERS');
const changeHook = defineSecret('DISCORD_WEBHOOK_ACCOUNT_CHANGES');
const duplicateHook = defineSecret('DISCORD_WEBHOOK_DUPLICATES');

function londonNow() {
  return new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour12: false });
}

function shortId(uid) {
  return String(uid || '').slice(0, 6);
}

function createAlerts(db) {
  async function enabled(kind) {
    const snap = await db.doc('config/adminAlerts').get();
    if (!snap.exists) return true;
    return snap.data()[kind] !== false;
  }

  async function emailFor(uid) {
    try {
      const user = await getAuth().getUser(uid);
      return user.email || '';
    } catch (_) {
      return '';
    }
  }

  async function remember(uid, profile, email) {
    const ref = db.doc('adminIndex/directory');
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const entries = { ...((snap.exists && snap.data().entries) || {}) };
      entries[uid] = accountEntry(uid, profile, email);
      if (!directoryWithinLimit(entries)) {
        console.error('account index is near 1MB, left unchanged');
        return;
      }
      tx.set(ref, { entries, updatedAt: new Date().toISOString() });
    });
  }

  const alertProfile = onDocumentWritten({
    document: 'users/{uid}/settings/profile',
    secrets: [signupHook, changeHook],
    timeoutSeconds: 30,
    memory: '256MiB',
  }, async (event) => {
    const uid = event.params.uid;
    const beforeSnap = event.data && event.data.before;
    const afterSnap = event.data && event.data.after;
    const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
    const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;
    if (!after) return;
    const email = await emailFor(uid);
    await remember(uid, after, email);
    if (!before) {
      if (!(await enabled('signups'))) return;
      const posted = await postDiscord(
        signupHook.value(),
        `New sign-up ${shortId(uid)} at ${londonNow()} London. ${maskEmail(email)}`.trim(),
      );
      if (!posted) console.error('new-user alert was not delivered');
      return;
    }
    const fields = changedFields(before, after, ['displayName', 'dateOfBirth', 'handle', 'visibility']);
    if (!fields.length || !(await enabled('changes'))) return;
    const posted = await postDiscord(
      changeHook.value(),
      `Profile change ${shortId(uid)} at ${londonNow()} London. ${fields.join(', ')}. ${maskEmail(email)}`.trim(),
    );
    if (!posted) console.error('profile alert was not delivered');
  });

  const alertEntitlements = onDocumentWritten({
    document: 'users/{uid}/entitlements/main',
    secrets: [changeHook],
    timeoutSeconds: 30,
    memory: '256MiB',
  }, async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.exists ? event.data.after.data() : {};
    const fields = changedFields(before, after, ['allowanceExempt', 'premium', 'dailyAllowance']);
    if (!fields.length || !(await enabled('changes'))) return;
    const posted = await postDiscord(
      changeHook.value(),
      `Entitlement change ${shortId(event.params.uid)} at ${londonNow()} London. ${fields.join(', ')}.`,
    );
    if (!posted) console.error('entitlement alert was not delivered');
  });

  const alertStaff = onDocumentWritten({
    document: 'users/{uid}/settings/staff',
    secrets: [changeHook],
    timeoutSeconds: 30,
    memory: '256MiB',
  }, async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.exists ? event.data.after.data() : {};
    const fields = changedFields(before, after, ['role', 'admin', 'blocked']);
    if (!fields.length || !(await enabled('changes'))) return;
    const posted = await postDiscord(
      changeHook.value(),
      `Staff change ${shortId(event.params.uid)} at ${londonNow()} London. ${fields.join(', ')}.`,
    );
    if (!posted) console.error('staff alert was not delivered');
  });

  const nightlyDuplicates = onSchedule({
    schedule: '15 3 * * *',
    timeZone: 'Europe/London',
    secrets: [duplicateHook],
    timeoutSeconds: 60,
    memory: '256MiB',
  }, async () => {
    if (!(await enabled('duplicates'))) return;
    const snap = await db.doc('adminIndex/directory').get();
    const entries = Object.entries((snap.exists && snap.data().entries) || {}).map(([uid, row]) => ({
      uid,
      ...(row || {}),
    }));
    const groups = duplicateGroups(entries);
    if (!groups.length) return;
    const lines = groups.map((group) => `${group.kind} ${group.key}: ${group.uids.map(shortId).join(', ')}`);
    const posted = await postDiscord(
      duplicateHook.value(),
      `Possible duplicates ${londonNow()} London.\n${lines.join('\n')}`,
    );
    if (!posted) console.error('duplicate summary was not delivered');
  });

  const setDailyAllowance = onSchedule({
    schedule: '45 2 * * *',
    timeZone: 'Europe/London',
    timeoutSeconds: 120,
    memory: '256MiB',
  }, async () => {
    const rulesRef = db.doc('config/usageRules');
    const rulesSnap = await rulesRef.get();
    const rules = rulesSnap.exists ? rulesSnap.data() : {};
    if (rules.allowanceLocked === true) return;
    const windowDays = Math.min(31, Math.max(1, Number(rules.allowanceWindowDays) || 7));
    const ids = new Set();
    const today = new Date();
    for (let i = 0; i < windowDays; i += 1) {
      const day = ukDay(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
      const snap = await db.collection('activity').doc(day).collection('users').get();
      snap.forEach((docSnap) => ids.add(docSnap.id));
    }
    const result = computeAllowance({
      budget: rules.allowanceBudget,
      activeUsers: ids.size,
      floor: rules.allowanceFloor,
      ceiling: rules.allowanceCeiling,
    });
    if (result.overBudget) {
      console.warn('Allowance floor times active users is above the daily read budget', result);
    }
    await rulesRef.set({
      dailyAllowance: result.cap,
      allowanceComputedAt: new Date().toISOString(),
      activeUsers: result.activeUsers,
      allowanceBudget: result.budget,
      allowanceFloor: result.floor,
      allowanceCeiling: result.ceiling,
      allowanceWindowDays: windowDays,
    }, { merge: true });
  });

  return { alertProfile, alertEntitlements, alertStaff, nightlyDuplicates, setDailyAllowance };
}

module.exports = { createAlerts };
