import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { saveEvent, getEvents } from './eventService';

const LOCAL_KEY = '@timeline_open_banking_v1_';

/** Sandbox rows so mapping can be tested before TrueLayer / Yapily. Not a live Lloyds login. */
export const SANDBOX_TRANSACTIONS = [
  {
    id: 'sb-metro',
    bookedAt: '2026-09-02',
    amount: 40,
    direction: 'out',
    payee: 'Metro prepaid',
    kind: 'Direct debit',
    note: 'Electricity top-up',
  },
  {
    id: 'sb-rent',
    bookedAt: '2026-09-01',
    amount: 650,
    direction: 'out',
    payee: 'Landlord rent',
    kind: 'Rent',
    note: 'Monthly',
  },
  {
    id: 'sb-lloyds-card',
    bookedAt: '2026-09-10',
    amount: 104.99,
    direction: 'out',
    payee: 'Amazon',
    kind: 'Credit card',
    note: 'Lloyds card · WD Elements',
  },
  {
    id: 'sb-hellofresh',
    bookedAt: '2026-09-08',
    amount: 44.99,
    direction: 'out',
    payee: 'HelloFresh',
    kind: 'Direct debit',
    note: '',
  },
  {
    id: 'sb-starlink',
    bookedAt: '2026-09-05',
    amount: 30,
    direction: 'out',
    payee: 'Starlink',
    kind: 'Direct debit',
    note: '',
  },
  {
    id: 'sb-uber',
    bookedAt: '2026-09-07',
    amount: 18.4,
    direction: 'out',
    payee: 'Uber Eats',
    kind: 'Large spend',
    note: 'Delivery',
  },
  {
    id: 'sb-in',
    bookedAt: '2026-09-04',
    amount: 50,
    direction: 'in',
    payee: 'Refund',
    kind: 'Incoming',
    note: 'Starlink refund (sandbox)',
  },
];

export function emptyConnection() {
  return {
    status: 'disconnected',
    provider: null,
    institution: null,
    connectedAt: null,
    lastSyncedAt: null,
    importedIds: [],
  };
}

function storeKey() {
  const uid = auth.currentUser?.uid;
  return `${LOCAL_KEY}${uid || 'guest'}`;
}

function cloudDoc(uid) {
  return doc(db, 'users', uid, 'settings', 'openBanking');
}

export async function getOpenBanking() {
  let local = emptyConnection();
  try {
    const raw = await AsyncStorage.getItem(storeKey());
    if (raw) local = { ...emptyConnection(), ...JSON.parse(raw) };
  } catch {
    /* keep empty */
  }
  const uid = auth.currentUser?.uid;
  if (!uid) return local;
  try {
    const snap = await getDoc(cloudDoc(uid));
    if (snap.exists()) {
      const cloud = { ...emptyConnection(), ...snap.data() };
      await AsyncStorage.setItem(storeKey(), JSON.stringify(cloud));
      return cloud;
    }
  } catch (e) {
    console.warn('Open Banking cloud load failed.', e?.message || e);
  }
  return local;
}

async function writeConnection(state) {
  const next = { ...emptyConnection(), ...state, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(storeKey(), JSON.stringify(next));
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      await setDoc(cloudDoc(uid), next, { merge: true });
    } catch (e) {
      console.warn('Open Banking cloud save failed.', e?.message || e);
    }
  }
  return next;
}

/** Sandbox consent only — no bank password, no live API. */
export async function connectSandbox(institution = 'Lloyds (sandbox)') {
  const current = await getOpenBanking();
  return writeConnection({
    ...current,
    status: 'sandbox',
    provider: 'sandbox',
    institution,
    connectedAt: new Date().toISOString(),
  });
}

export async function disconnectOpenBanking() {
  const current = await getOpenBanking();
  return writeConnection({
    ...emptyConnection(),
    importedIds: current.importedIds || [],
  });
}

export async function importSandboxTransactions(ids) {
  const conn = await getOpenBanking();
  const want = new Set(ids && ids.length ? ids : SANDBOX_TRANSACTIONS.map((t) => t.id));
  const already = new Set(conn.importedIds || []);
  const events = await getEvents();
  const existingExt = new Set((events || []).map((e) => e.bankTxId).filter(Boolean));
  let added = 0;
  for (const tx of SANDBOX_TRANSACTIONS) {
    if (!want.has(tx.id)) continue;
    if (already.has(tx.id) || existingExt.has(tx.id)) continue;
    const sign = tx.direction === 'in' ? '+' : '−';
    await saveEvent({
      title: `${tx.payee} ${sign}£${Number(tx.amount).toFixed(2)}`,
      date: tx.bookedAt,
      source: 'bank',
      category: 'banking',
      bankKind: tx.kind,
      bankTxId: tx.id,
      amount: tx.amount,
      direction: tx.direction,
      payee: tx.payee,
      description: [tx.kind, tx.note, 'Imported from Open Banking sandbox'].filter(Boolean).join(' · '),
      labels: ['Banking', tx.kind],
    });
    already.add(tx.id);
    added += 1;
  }
  const next = await writeConnection({
    ...conn,
    importedIds: Array.from(already),
    lastSyncedAt: new Date().toISOString(),
  });
  return { added, connection: next };
}
