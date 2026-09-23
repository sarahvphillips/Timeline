import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const KEY_PREFIX = '@timeline_rewards_v1_';

/** First reward at 3 friends who actually joined (accepted a join code). */
export const JOIN_MILESTONES = [
  {
    id: 'join-3',
    joined: 3,
    credits: 5,
    perk: 'deliveryPerk',
    label: 'Delivery tracking perk + 5 credits',
  },
  {
    id: 'join-5',
    joined: 5,
    credits: 10,
    perk: null,
    label: '10 extra credits',
  },
  {
    id: 'join-10',
    joined: 10,
    credits: 15,
    perk: null,
    label: '15 extra credits',
  },
];

export const STAMPS = [
  { id: 'poem', label: 'Poem', screen: 'AddPoem' },
  { id: 'joined', label: 'Friend joined', screen: 'People' },
  { id: 'word', label: 'Word saved', screen: 'WordToInt' },
  { id: 'wash', label: 'Wash done', screen: 'AddWashLoad' },
  { id: 'shared', label: 'Event shared', screen: 'EventsWithFriends' },
  { id: 'checksum', label: 'Checksum', screen: 'YearOverview' },
  { id: 'food', label: 'Food', screen: 'AddFood' },
  { id: 'birthday', label: 'Birthday', screen: 'People' },
];

export const STAMP_ROW_SIZE = 4;
export const STAMP_ROW_REWARD = {
  id: 'stamp-row-1',
  credits: 2,
  label: 'First stamps row +2 credits',
};

export const GRAPH_SAVE_TIERS = [
  { id: 'graph-save-1', nodes: 30, credits: 1, label: 'First saved graph, 30 nodes, +1 credit' },
  { id: 'graph-save-50', nodes: 50, credits: 1, label: 'Saved graph, 50 nodes, +1 credit' },
  { id: 'graph-save-75', nodes: 75, credits: 2, label: 'Saved graph, 75 nodes, +2 credits' },
  { id: 'graph-save-100', nodes: 100, credits: 2, label: 'Saved graph, 100 nodes, +2 credits' },
  { id: 'graph-save-150', nodes: 150, credits: 3, label: 'Saved graph, 150 nodes, +3 credits' },
];

export const GRAPH_SAVE_REWARD = GRAPH_SAVE_TIERS[0];
export const GRAPH_SAVE_MIN_NODES = GRAPH_SAVE_TIERS[0].nodes;

export const CALL_RECORDING_COST = 4;
export const CALL_RECORDING_PERK = 'callRecording';
export const SHARE_WORDS_COST = 3;
export const SHARE_WORDS_PERK = 'shareWords';

/** Same SKUs as Mafia PurchasesActivity — consumable Play packs. */
export const CREDIT_PACKS = [
  { id: '1_credits', sku: '1_credits', credits: 1, priceLabel: 'Play Store', blurb: '1 credit' },
  { id: '10_credits', sku: '10_credits', credits: 10, priceLabel: 'Play Store', blurb: '10 credits' },
  { id: '25_credits', sku: '25_credits', credits: 25, priceLabel: 'Play Store', blurb: '25 credits' },
  { id: '100_credits', sku: '100_credits', credits: 100, priceLabel: 'Play Store', blurb: '100 credits' },
];

export const MAX_CREDIT_TRANSFER = 100;
export const TRANSFER_COOLDOWN_MS = 10000;

export const SHOP_ITEMS = [
  {
    id: 'deliveryPerk',
    title: 'Delivery tracking',
    blurb: 'Driver details and doorbell clips on purchases. Usually a paid perk.',
    cost: 5,
    perk: 'deliveryPerk',
  },
  {
    id: 'inviteBoost',
    title: 'Extra invite room',
    blurb: 'More friend invites before a paid cap.',
    cost: 3,
    perk: 'inviteBoost',
  },
  {
    id: 'clipPoints',
    title: 'Video clip points',
    blurb: 'Trim a copy, checksum it, leave the original.',
    cost: 4,
    perk: 'clipPoints',
  },
  {
    id: 'callRecording',
    title: 'Call recordings',
    blurb: 'Attach audio, a screen recording, or a voice note on phone-call events.',
    cost: 4,
    perk: 'callRecording',
  },
  {
    id: 'shareWords',
    title: 'Share word list',
    blurb: 'Share some or all of your Word to int list with a friend via invite code.',
    cost: 3,
    perk: 'shareWords',
  },
  {
    id: 'customCategories',
    title: 'Custom event categories',
    blurb: 'Add your own categories in Settings. Built-in Personal / Work / Family stay.',
    cost: 4,
    perk: 'customCategories',
  },
  {
    id: 'checksumHome',
    title: 'Checksums on Home',
    blurb: 'Shortcut to event and video checksums.',
    cost: 2,
    perk: 'checksumHome',
  },
  {
    id: 'openBanking',
    title: 'Open Banking',
    blurb: 'Optional bank link (sandbox now). Live Lloyds later via a regulated provider. Screenshots stay free.',
    cost: 6,
    perk: 'openBanking',
  },
];

function storeKey(uid) {
  const id = uid || auth.currentUser?.uid;
  return id ? `${KEY_PREFIX}${id}` : `${KEY_PREFIX}guest`;
}

function rewardsDoc(uid) {
  return doc(db, 'users', uid, 'settings', 'rewards');
}

function rewardsIndexDoc(email) {
  return doc(db, 'rewardsIndex', String(email || '').trim().toLowerCase());
}

function normalizeRewards(raw) {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  return {
    ...emptyRewards(),
    ...parsed,
    unlockedPerks: Array.isArray(parsed.unlockedPerks) ? parsed.unlockedPerks : [],
    claimedMilestones: Array.isArray(parsed.claimedMilestones) ? parsed.claimedMilestones : [],
    purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
    lastTransferAt: parsed.lastTransferAt || null,
    credits: Number(parsed.credits) || 0,
  };
}

export function emptyRewards() {
  return {
    credits: 0,
    unlockedPerks: [],
    claimedMilestones: [],
    purchases: [],
    lastTransferAt: null,
    updatedAt: null,
  };
}

export async function getRewards() {
  let local = emptyRewards();
  try {
    const raw = await AsyncStorage.getItem(storeKey());
    if (raw) local = normalizeRewards(JSON.parse(raw));
  } catch {
    local = emptyRewards();
  }

  const uid = auth.currentUser?.uid;
  const email = String(auth.currentUser?.email || '').trim().toLowerCase();
  if (!uid) return local;

  try {
    const snap = await getDoc(rewardsDoc(uid));
    if (snap.exists()) {
      const cloud = normalizeRewards(snap.data());
      await AsyncStorage.setItem(storeKey(uid), JSON.stringify({ ...cloud, updatedAt: cloud.updatedAt || new Date().toISOString() }));
      return cloud;
    }
    return persistRewards(uid, email, local, { localToo: true });
  } catch (e) {
    console.warn('Rewards cloud load failed; using device copy.', e?.message || e);
  }
  return local;
}

async function persistRewards(uid, email, state, { localToo = false } = {}) {
  const next = {
    ...emptyRewards(),
    ...state,
    credits: Math.max(0, Number(state?.credits) || 0),
    unlockedPerks: Array.isArray(state?.unlockedPerks) ? state.unlockedPerks : [],
    claimedMilestones: Array.isArray(state?.claimedMilestones) ? state.claimedMilestones : [],
    purchases: Array.isArray(state?.purchases) ? state.purchases.slice(-50) : [],
    lastTransferAt: state?.lastTransferAt || null,
    updatedAt: new Date().toISOString(),
    uid: uid || null,
    email: String(email || '').trim().toLowerCase() || null,
  };
  if (localToo) {
    await AsyncStorage.setItem(storeKey(uid), JSON.stringify(next));
  }
  if (uid) {
    try {
      await setDoc(rewardsDoc(uid), next, { merge: true });
      if (next.email) {
        await setDoc(
          rewardsIndexDoc(next.email),
          {
            uid,
            email: next.email,
            credits: next.credits,
            unlockedPerks: next.unlockedPerks,
            updatedAt: next.updatedAt,
          },
          { merge: true },
        );
      }
    } catch (e) {
      console.warn('Rewards cloud save failed; kept on device.', e?.message || e);
    }
  }
  return next;
}

async function writeRewards(state) {
  const uid = auth.currentUser?.uid;
  const email = String(auth.currentUser?.email || '').trim().toLowerCase();
  return persistRewards(uid, email, state, { localToo: true });
}

/** Admin: look up credits by account email. */
export async function adminGetRewardsByEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) {
    return { email: '', uid: null, rewards: null, missing: true, error: 'Type an email first.' };
  }
  const me = String(auth.currentUser?.email || '').trim().toLowerCase();
  const myUid = auth.currentUser?.uid || null;

  try {
    const idx = await getDoc(rewardsIndexDoc(key));
    if (idx.exists()) {
      const uid = idx.data()?.uid || (key === me ? myUid : null);
      if (uid) {
        const snap = await getDoc(rewardsDoc(uid));
        const rewards = snap.exists()
          ? normalizeRewards(snap.data())
          : normalizeRewards(idx.data());
        return { email: key, uid, rewards, missing: false };
      }
    }
  } catch (e) {
    if (key !== me) {
      return {
        email: key,
        uid: null,
        rewards: null,
        missing: true,
        error: e?.message || 'Firestore read failed. Publish firestore.rules if this is permission-denied.',
      };
    }
  }

  if (key === me && myUid) {
    try {
      const snap = await getDoc(rewardsDoc(myUid));
      if (snap.exists()) {
        return { email: key, uid: myUid, rewards: normalizeRewards(snap.data()), missing: false };
      }
    } catch {
      /* use local */
    }
    const local = await getRewards();
    return { email: key, uid: myUid, rewards: local, missing: false };
  }

  return {
    email: key,
    uid: null,
    rewards: null,
    missing: true,
    error: 'No rewards record for that email yet. They need to open Timeline once while signed in.',
  };
}

/** Admin: set credit balance (and optional extra perk) for an email. */
export async function adminSetRewards(email, patch) {
  const found = await adminGetRewardsByEmail(email);
  const me = String(auth.currentUser?.email || '').trim().toLowerCase();
  const myUid = auth.currentUser?.uid || null;
  let uid = found?.uid;
  let base = found?.rewards || emptyRewards();
  if (!uid && found?.email === me && myUid) {
    uid = myUid;
  }
  if (!uid) {
    const err = new Error(
      found?.error ||
        'No rewards record for that email yet. They need to open the app once while signed in.',
    );
    err.code = 'MISSING';
    throw err;
  }
  const credits =
    patch.credits == null ? base.credits : Math.max(0, Number(patch.credits) || 0);
  let unlocked = [...(base.unlockedPerks || [])];
  if (patch.addPerk && !unlocked.includes(patch.addPerk)) unlocked.push(patch.addPerk);
  if (patch.removePerk) unlocked = unlocked.filter((p) => p !== patch.removePerk);
  const next = await persistRewards(
    uid,
    found.email || me,
    { ...base, credits, unlockedPerks: unlocked },
    { localToo: uid === myUid },
  );
  return { email: found.email || me, uid, rewards: next };
}

/** Play SKU consume → add credits. Same product ids as Mafia. */
export async function applyPurchasedPack(sku, { tester = false, purchaseToken = '' } = {}) {
  const pack = CREDIT_PACKS.find((p) => p.sku === sku || p.id === sku);
  if (!pack) {
    const err = new Error('Unknown credit pack.');
    err.code = 'UNKNOWN_PACK';
    throw err;
  }
  if (!tester && !purchaseToken) {
    const err = new Error(
      `Google Play SKU "${pack.sku}" (package com.sarahphillips.timelineapp). Create that in-app product in Play Console, then buy from a store build.`,
    );
    err.code = 'NO_STORE';
    throw err;
  }
  const current = await getRewards();
  if (purchaseToken && (current.purchases || []).some((p) => p.token === purchaseToken)) {
    return current;
  }
  return writeRewards({
    ...current,
    credits: current.credits + pack.credits,
    purchases: [
      ...(current.purchases || []),
      {
        sku: pack.sku,
        credits: pack.credits,
        at: new Date().toISOString(),
        source: tester ? 'tester' : 'play',
        token: purchaseToken || null,
      },
    ],
  });
}

async function lookupRewardsByEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;
  const idx = await getDoc(rewardsIndexDoc(key));
  if (!idx.exists() || !idx.data()?.uid) return null;
  return { email: key, uid: idx.data().uid };
}

export async function claimPendingTransfers() {
  const uid = auth.currentUser?.uid;
  const email = String(auth.currentUser?.email || '').trim().toLowerCase();
  if (!uid || !email) return 0;
  let added = 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'creditTransfers'), where('toUid', '==', uid)),
    );
    const current = await getRewards();
    let credits = current.credits;
    const purchases = [...(current.purchases || [])];
    const ops = [];
    snap.forEach((row) => {
      const data = row.data() || {};
      if (data.status && data.status !== 'pending') return;
      const n = Math.max(0, Number(data.amount) || 0);
      if (!n) return;
      added += n;
      credits += n;
      purchases.push({
        sku: 'transfer',
        credits: n,
        at: new Date().toISOString(),
        source: 'transfer',
        from: data.fromEmail || '',
      });
      ops.push(updateDoc(row.ref, { status: 'claimed', claimedAt: new Date().toISOString() }));
    });
    if (added) {
      await writeRewards({ ...current, credits, purchases });
      await Promise.all(ops);
    }
  } catch (e) {
    console.warn('Credit transfer claim failed.', e?.message || e);
  }
  return added;
}

/** Mafia TransferCredits: max 100, 10s cooldown, not to yourself. Recipient claims on next open. */
export async function transferCredits(toEmail, amount) {
  const n = Math.floor(Number(amount));
  const me = String(auth.currentUser?.email || '').trim().toLowerCase();
  const myUid = auth.currentUser?.uid;
  const destEmail = String(toEmail || '').trim().toLowerCase();
  if (!myUid || !me) throw new Error('Sign in first.');
  if (!destEmail) throw new Error('Please enter an email.');
  if (destEmail === me) throw new Error("You can't transfer credits to yourself!");
  if (!n || n <= 0) throw new Error('Please enter an amount.');
  if (n > MAX_CREDIT_TRANSFER) throw new Error('That number is too large!');
  const current = await getRewards();
  const last = current.lastTransferAt ? new Date(current.lastTransferAt).getTime() : 0;
  if (Date.now() - last < TRANSFER_COOLDOWN_MS) {
    throw new Error("You can't try to transfer that often!");
  }
  if (n > current.credits) throw new Error("You don't have enough credits for that!");
  const dest = await lookupRewardsByEmail(destEmail);
  if (!dest) {
    throw new Error('That email was not found, please try again.');
  }
  await writeRewards({
    ...current,
    credits: current.credits - n,
    lastTransferAt: new Date().toISOString(),
    purchases: [
      ...(current.purchases || []),
      {
        sku: 'transfer-out',
        credits: -n,
        at: new Date().toISOString(),
        source: 'transfer',
        to: destEmail,
      },
    ],
  });
  await addDoc(collection(db, 'creditTransfers'), {
    fromUid: myUid,
    fromEmail: me,
    toEmail: destEmail,
    toUid: dest.uid,
    amount: n,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  return n;
}

export function inviteStats(people) {
  const list = people || [];
  const invited = list.filter((p) => p.inviteSent || p.joinCode).length;
  const joined = list.filter((p) => p.onApp || p.linkedUid).length;
  const nextMilestone = JOIN_MILESTONES.find((m) => joined < m.joined) || null;
  const remaining = nextMilestone ? Math.max(0, nextMilestone.joined - joined) : 0;
  return { invited, joined, total: list.length, nextMilestone, remaining };
}

export async function applyJoinRewards(people) {
  const stats = inviteStats(people);
  const current = await getRewards();
  const newlyClaimed = [];
  let credits = current.credits;
  const unlocked = new Set(current.unlockedPerks);
  const claimed = new Set(current.claimedMilestones);

  JOIN_MILESTONES.forEach((m) => {
    if (stats.joined < m.joined) return;
    if (claimed.has(m.id)) return;
    claimed.add(m.id);
    credits += m.credits || 0;
    if (m.perk) unlocked.add(m.perk);
    newlyClaimed.push(m);
  });

  const next = await writeRewards({
    ...current,
    credits,
    unlockedPerks: Array.from(unlocked),
    claimedMilestones: Array.from(claimed),
  });
  return { rewards: next, newlyClaimed, stats };
}

function hasChecksum(event) {
  return !!(
    event?.checksum ||
    event?.sha256 ||
    event?.fileChecksum ||
    event?.clipChecksum ||
    event?.videoChecksum
  );
}

export function evaluateStamps({ events = [], people = [], words = [] }) {
  const list = events || [];
  const earnedMap = {
    poem: list.some(
      (e) =>
        String(e.hobbyType || '').toLowerCase() === 'poetry' ||
        (e.source === 'hobby' && String(e.hobbyType || '').toLowerCase() === 'poetry')
    ),
    joined: (people || []).some((p) => p.onApp || p.linkedUid),
    word: (words || []).length > 0,
    wash: list.some((e) => e.source === 'laundry' || e.category === 'household'),
    shared: list.some((e) => e.isShared || e.shareId),
    checksum: list.some(hasChecksum),
    food: list.some((e) => e.source === 'food'),
    birthday:
      list.some(
        (e) =>
          e.source === 'people' ||
          (Array.isArray(e.labels) && e.labels.map(String).includes('Birthday'))
      ),
  };
  return STAMPS.map((s) => ({ ...s, earned: !!earnedMap[s.id] }));
}

export async function applyStampRowReward(stamps) {
  const row = (stamps || []).slice(0, STAMP_ROW_SIZE);
  const current = await getRewards();
  if (!row.length || row.some((s) => !s.earned)) {
    return { rewards: current, newlyClaimed: [] };
  }
  if ((current.claimedMilestones || []).includes(STAMP_ROW_REWARD.id)) {
    return { rewards: current, newlyClaimed: [] };
  }
  const next = await writeRewards({
    ...current,
    credits: current.credits + STAMP_ROW_REWARD.credits,
    claimedMilestones: [...current.claimedMilestones, STAMP_ROW_REWARD.id],
  });
  return { rewards: next, newlyClaimed: [STAMP_ROW_REWARD] };
}

export async function claimGraphSaveRewards(nodeCount) {
  const count = Number(nodeCount) || 0;
  const current = await getRewards();
  const claimed = new Set(current.claimedMilestones || []);
  const newly = GRAPH_SAVE_TIERS.filter((tier) => count >= tier.nodes && !claimed.has(tier.id));
  if (!newly.length) {
    return { rewards: current, granted: false, credits: 0, tiers: [] };
  }
  const credits = newly.reduce((sum, tier) => sum + tier.credits, 0);
  newly.forEach((tier) => claimed.add(tier.id));
  const next = await writeRewards({
    ...current,
    credits: current.credits + credits,
    claimedMilestones: [...claimed],
  });
  return { rewards: next, granted: true, credits, tiers: newly };
}

export async function claimFirstGraphSave(nodeCount) {
  return claimGraphSaveRewards(nodeCount);
}

export async function spendShopItem(itemId) {
  const item = SHOP_ITEMS.find((s) => s.id === itemId);
  if (!item) throw new Error('Unknown shop item');
  const current = await getRewards();
  if (hasPerk(current, item.perk)) {
    const err = new Error('Already unlocked');
    err.code = 'OWNED';
    throw err;
  }
  if (current.credits < item.cost) {
    const err = new Error(`Need ${item.cost} credits (you have ${current.credits}).`);
    err.code = 'NEED_CREDITS';
    throw err;
  }
  return writeRewards({
    ...current,
    credits: current.credits - item.cost,
    unlockedPerks: [...current.unlockedPerks, item.perk],
  });
}

export function hasPerk(rewards, key) {
  return Array.isArray(rewards?.unlockedPerks) && rewards.unlockedPerks.includes(key);
}

export function perkLabel(key) {
  if (key === 'deliveryPerk') return 'Delivery tracking perk';
  if (key === 'inviteBoost') return 'Extra invite room';
  if (key === 'clipPoints') return 'Video clip points';
  if (key === 'callRecording') return 'Call recordings';
  if (key === 'customCategories') return 'Custom event categories';
  if (key === 'checksumHome') return 'Checksums on Home';
  if (key === 'openBanking') return 'Open Banking';
  if (key === 'shareWords') return 'Share word list';
  return key;
}
