import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { GRAPH_SHARE_DATA_COST, SHOP_ITEMS } from './rewardsService';

const LOCAL_PREFIX = '@timeline_credit_feedback_';

export function creditFeedbackItems() {
  const items = SHOP_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    blurb: item.blurb,
    cost: item.cost,
    eachTime: false,
  }));
  items.push({
    id: 'graphShareData',
    title: 'Share graph data',
    blurb: 'Sending the words, notes, numbers and positions. A picture of the graph stays free.',
    cost: GRAPH_SHARE_DATA_COST,
    eachTime: true,
  });
  return items;
}

function emptyVotes() {
  const votes = {};
  creditFeedbackItems().forEach((item) => {
    votes[item.id] = '';
  });
  return votes;
}

export async function loadMyCreditFeedback() {
  const uid = auth.currentUser?.uid;
  const blank = { votes: emptyVotes(), note: '' };
  if (!uid) return blank;
  try {
    const snap = await getDoc(doc(db, 'testerFeedback', uid));
    if (snap.exists()) {
      const data = snap.data() || {};
      return {
        votes: { ...emptyVotes(), ...(data.votes || {}) },
        note: String(data.note || ''),
      };
    }
  } catch (e) {
    console.warn('credit feedback cloud read skipped', e);
  }
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PREFIX + uid);
    if (!raw) return blank;
    const parsed = JSON.parse(raw);
    return {
      votes: { ...emptyVotes(), ...(parsed.votes || {}) },
      note: String(parsed.note || ''),
    };
  } catch {
    return blank;
  }
}

export async function saveCreditFeedback({ votes, note }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const payload = {
    uid: user.uid,
    email: String(user.email || '').toLowerCase(),
    kind: 'credits',
    votes: votes || {},
    note: String(note || '').trim().slice(0, 2000),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(LOCAL_PREFIX + user.uid, JSON.stringify(payload));
  await setDoc(doc(db, 'testerFeedback', user.uid), payload);
  return payload;
}

export async function listCreditFeedback() {
  const snap = await getDocs(collection(db, 'testerFeedback'));
  return snap.docs
    .map((row) => ({ id: row.id, ...row.data() }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
