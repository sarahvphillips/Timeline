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

export function hasPerk(rewards, key) {
  return Array.isArray(rewards?.unlockedPerks) && rewards.unlockedPerks.includes(key);
}

export function perkLabel(key) {
  if (key === 'deliveryPerk') return 'Delivery tracking perk';
  return key;
}
