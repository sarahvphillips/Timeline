import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

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

function storeKey() {
  const uid = auth.currentUser?.uid;
  return uid ? `${KEY_PREFIX}${uid}` : `${KEY_PREFIX}guest`;
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
  try {
    const raw = await AsyncStorage.getItem(storeKey());
    if (!raw) return emptyRewards();
    const parsed = JSON.parse(raw);
    return {
      ...emptyRewards(),
      ...parsed,
      unlockedPerks: Array.isArray(parsed.unlockedPerks) ? parsed.unlockedPerks : [],
      claimedMilestones: Array.isArray(parsed.claimedMilestones) ? parsed.claimedMilestones : [],
      credits: Number(parsed.credits) || 0,
    };
  } catch {
    return emptyRewards();
  }
}

async function writeRewards(state) {
  const next = { ...emptyRewards(), ...state, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(storeKey(), JSON.stringify(next));
  return next;
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
