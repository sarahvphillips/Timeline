import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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

export const CALL_RECORDING_COST = 4;
export const CALL_RECORDING_PERK = 'callRecording';

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
    id: 'customCategories',
    title: 'Custom event categories',
    blurb: 'Add your own categories in Settings.',
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
    credits: Number(parsed.credits) || 0,
  };
}

export function emptyRewards() {
  return {
    credits: 0,
    unlockedPerks: [],
    claimedMilestones: [],
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
  if (!key) return null;
  const idx = await getDoc(rewardsIndexDoc(key));
  if (!idx.exists()) return { email: key, uid: null, rewards: null, missing: true };
  const uid = idx.data()?.uid;
  if (!uid) return { email: key, uid: null, rewards: normalizeRewards(idx.data()), missing: false };
  const snap = await getDoc(rewardsDoc(uid));
  const rewards = snap.exists() ? normalizeRewards(snap.data()) : normalizeRewards(idx.data());
  return { email: key, uid, rewards, missing: false };
}

/** Admin: set credit balance (and optional extra perk) for an email. */
export async function adminSetRewards(email, patch) {
  const found = await adminGetRewardsByEmail(email);
  if (!found || found.missing || !found.uid) {
    const err = new Error('No rewards record for that email yet. They need to open the app once while signed in.');
    err.code = 'MISSING';
    throw err;
  }
  const credits =
    patch.credits == null ? found.rewards.credits : Math.max(0, Number(patch.credits) || 0);
  let unlocked = [...(found.rewards.unlockedPerks || [])];
  if (patch.addPerk && !unlocked.includes(patch.addPerk)) unlocked.push(patch.addPerk);
  if (patch.removePerk) unlocked = unlocked.filter((p) => p !== patch.removePerk);
  const next = await persistRewards(
    found.uid,
    found.email,
    { ...found.rewards, credits, unlockedPerks: unlocked },
    { localToo: found.uid === auth.currentUser?.uid },
  );
  return { email: found.email, uid: found.uid, rewards: next };
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
  return key;
}
