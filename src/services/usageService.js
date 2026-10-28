import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const DEFAULT_RULES = {
  dailyAllowance: 500,
  resetTz: 'Europe/London',
  adUnlockPoints: 200,
  version: 1,
  wR: 1,
  wW: 3,
  wD: 1,
};

let rulesCache = null;
let usage = emptyUsage();
let lastFlush = 0;

function emptyUsage() {
  return { date: ukDay(), reads: 0, writes: 0, deletes: 0 };
}

export function ukDay(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function rollDay() {
  const today = ukDay();
  if (usage.date !== today) usage = emptyUsage();
}

export function noteRead(count = 1) {
  rollDay();
  usage.reads += count;
}

export function noteWrite(count = 1) {
  rollDay();
  usage.writes += count;
}

export function noteDelete(count = 1) {
  rollDay();
  usage.deletes += count;
}

export function usagePoints(row = usage, rules = rulesCache || DEFAULT_RULES) {
  const reads = Number(row?.reads) || 0;
  const writes = Number(row?.writes) || 0;
  const deletes = Number(row?.deletes) || 0;
  return reads * (Number(rules.wR) || 1) + writes * (Number(rules.wW) || 3) + deletes * (Number(rules.wD) || 1);
}

export function heavySyncPaused() {
  rollDay();
  const allowance = Number((rulesCache || DEFAULT_RULES).dailyAllowance) || 500;
  return usagePoints() >= allowance;
}

export async function loadUsageRules() {
  if (rulesCache) return rulesCache;
  const uid = auth.currentUser?.uid;
  if (!uid) return DEFAULT_RULES;
  try {
    const snap = await getDoc(doc(db, 'config', 'usageRules'));
    noteRead(1);
    rulesCache = snap.exists() ? { ...DEFAULT_RULES, ...snap.data() } : DEFAULT_RULES;
  } catch {
    rulesCache = DEFAULT_RULES;
  }
  return rulesCache;
}

export async function saveUsageRules(next) {
  const rules = {
    ...DEFAULT_RULES,
    ...next,
    dailyAllowance: Math.max(1, Number(next?.dailyAllowance) || DEFAULT_RULES.dailyAllowance),
    wR: Number(next?.wR) || 1,
    wW: Number(next?.wW) || 3,
    wD: Number(next?.wD) || 1,
    version: Date.now(),
  };
  await setDoc(doc(db, 'config', 'usageRules'), rules, { merge: true });
  noteWrite(1);
  rulesCache = rules;
  return rules;
}

export async function allowanceStatus() {
  const rules = await loadUsageRules();
  rollDay();
  const used = usagePoints(usage, rules);
  const allowance = Number(rules.dailyAllowance) || 500;
  return { over: used >= allowance, used, allowance, reads: usage.reads, writes: usage.writes, deletes: usage.deletes };
}

export async function flushUsage() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  rollDay();
  const now = Date.now();
  if (now - lastFlush < 120000) return;
  lastFlush = now;
  try {
    await setDoc(
      doc(db, 'users', uid, 'meta', 'usage'),
      {
        date: usage.date,
        reads: usage.reads,
        writes: usage.writes,
        deletes: usage.deletes,
        points: usagePoints(),
        lastSaved: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (e) {
    lastFlush = 0;
    console.warn('Could not save usage', e?.message || e);
  }
}

export async function readStoredUsageNote() {
  const uid = auth.currentUser?.uid;
  if (!uid) return '';
  try {
    const raw = await AsyncStorage.getItem(`@timeline_allowance_${uid}`);
    return raw || '';
  } catch {
    return '';
  }
}
