import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../services/firebase';
import {
  getMySharedEvents,
  listOtherParticipants,
  hasActiveOtherParticipants,
  FRIEND_COLOURS,
} from '../services/shareService';
import { getEvents } from '../services/eventService';
import { getProfile, getProfilePhotoUri } from '../services/profileService';
import HomeFab from '../components/HomeFab';

const { width: SCREEN_W } = Dimensions.get('window');
const ME_COLOUR = '#2dd4bf';
const FRIEND_PINK = '#f472b6';
const SPINE_COLOUR = '#94a3b8';
const CARD_W = Math.min(138, Math.floor(SCREEN_W * 0.36));
const CENTRE_CARD_W = Math.min(190, Math.floor(SCREEN_W * 0.5));
const CURVE = 34;
const PRIVATE_KEY = '@timeline_friends_show_private';
const PRIVATE_COLOUR = '#94a3b8';

function formatDateLabel(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch (_) {
    return '';
  }
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const h = d.getHours();
    const m = d.getMinutes();
    if (!h && !m) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoWeekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

function weekKey(d) {
  return `${d.getFullYear()}-W${isoWeekNumber(d)}`;
}

function weekLabel(d) {
  const day = d.getDay() || 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day - 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x) =>
    x.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `W${isoWeekNumber(d)} · ${fmt(start)} – ${fmt(end)}`;
}

function monthLabel(d) {
  return d.toLocaleDateString(undefined, { month: 'short' });
}

function friendshipSpan(events) {
  const dates = (events || []).map((e) => parseDate(e.date)).filter(Boolean);
  if (!dates.length) return '';
  dates.sort((a, b) => a - b);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const y0 = first.getFullYear();
  const y1 = last.getFullYear();
  const from = first.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const to = last.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (y0 === y1) return `Shared in ${y0}`;
  return `${from} → ${to} · ${y1 - y0} year${y1 - y0 === 1 ? '' : 's'}`;
}

function cardGlyph(ev) {
  const blob = `${ev?.category || ''} ${ev?.source || ''} ${ev?.hobbyType || ''} ${ev?.title || ''}`.toLowerCase();
  if (/poem|poetry|verse/.test(blob)) return '📖';
  if (/food|coffee|meal|eat/.test(blob)) return '☕';
  if (/walk|hike|outdoors/.test(blob)) return '🏔️';
  if (/gratitude|love|heart/.test(blob)) return '♡';
  if (/sms|text/.test(blob)) return '💬';
  if (/call|phone/.test(blob)) return '📞';
  if (/game/.test(blob)) return '🎮';
  if (/social|post/.test(blob)) return '✦';
  return '◆';
}

function uniqueNames(parts) {
  const seen = new Set();
  const out = [];
  parts.forEach((p) => {
    const n = (p || '').trim();
    if (!n) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(n);
  });
  return out;
}

function Avatar({ name, photoUri, colour, size = 52 }) {
  const initial = (name || 'Y').charAt(0).toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: colour,
          backgroundColor: photoUri ? colour : '#0a0a12',
        },
      ]}
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2 }}
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.4, color: colour }]}>{initial}</Text>
      )}
    </View>
  );
}

function Curve({ colour, side }) {
  const common = {
    width: CURVE,
    height: CURVE,
    borderColor: colour,
    borderWidth: 2.5,
    borderTopWidth: 0,
  };
  return (
    <View style={styles.curveCol} pointerEvents="none">
      <View style={[styles.curveDot, { backgroundColor: colour }]} />
      <View
        style={
          side === 'left'
            ? { ...common, borderLeftWidth: 0, borderBottomRightRadius: CURVE }
            : { ...common, borderRightWidth: 0, borderBottomLeftRadius: CURVE }
        }
      />
    </View>
  );
}

function navigateToEvent(navigation, event) {
  if (!event) return;
  if (event.source === 'food') navigation.navigate('AddFood', { event });
  else if (event.source === 'laundry') navigation.navigate('AddWashLoad', { event });
  else if (event.hobbyType === 'poetry') navigation.navigate('AddPoem', { event });
  else if (event.source === 'qr') navigation.navigate('AddQr', { event });
  else navigation.navigate('AddEvent', { event });
}

function SharedCard({ item, meLabel, myEmail, colour, onPress }) {
  const shared = item.shared;
  const friends = item.friends || [];
  const names = uniqueNames([
    meLabel,
    ...friends.map((f) => f.initial || (f.displayName || '').charAt(0)),
  ]);
  const withLabel =
    names.length > 1 ? `With ${names.join(' and ')}` : names.length === 1 ? `With ${names[0]}` : 'Shared event';

  const creatorEmail = (
    shared.createdByEmail ||
    (shared.participants &&
      shared.createdByUid &&
      shared.participants[shared.createdByUid] &&
      shared.participants[shared.createdByUid].email) ||
    ''
  ).toLowerCase();
  const mine = (myEmail || '').toLowerCase();
  const fromOther = creatorEmail && mine && creatorEmail !== mine;

  const time = formatTime(shared.date);
  const dateBit = formatDateLabel(shared.date);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.personalCard, { borderColor: colour + '99' }]}
    >
      <View style={styles.personalHead}>
        <Text style={{ color: colour, fontSize: 16 }}>👥</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {shared.title || 'Shared event'}
          </Text>
          <Text style={[styles.cardDate, { color: colour }]}>
            {dateBit}
            {time ? ` · ${time}` : ''}
          </Text>
        </View>
      </View>
      <Text style={styles.cardSub} numberOfLines={1}>
        {withLabel}
      </Text>
      {fromOther ? (
        <Text style={[styles.fromFriend, { textAlign: 'left' }]} numberOfLines={1}>
          From friend
        </Text>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={{ fontSize: 11, color: colour }}>🔒</Text>
        <Text style={[styles.cardFooterText, { color: colour }]}>Shared</Text>
      </View>
    </TouchableOpacity>
  );
}

function PersonalCard({ event, colour, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.personalCard, { borderColor: colour + '99' }]}
    >
      <View style={styles.personalHead}>
        <Text style={{ color: colour, fontSize: 16 }}>{cardGlyph(event)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {event.title || 'Untitled'}
          </Text>
          <Text style={[styles.cardDate, { color: colour }]}>{formatDateLabel(event.date)}</Text>
        </View>
      </View>
      {event.description ? (
        <Text style={styles.cardSub} numberOfLines={1}>
          {event.description}
        </Text>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={{ color: colour, fontSize: 11 }}>🔒</Text>
        <Text style={[styles.cardFooterText, { color: colour }]}>Personal only</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function EventsWithFriendsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [sharedEvents, setSharedEvents] = useState([]);
  const [personalEvents, setPersonalEvents] = useState([]);
  const [localByShareId, setLocalByShareId] = useState({});
  const [me, setMe] = useState({ displayName: 'You', photoUri: null, initial: 'Y', email: '' });
  const [friendFilter, setFriendFilter] = useState('all');
  const [showPrivate, setShowPrivate] = useState(false);
  const myUid = auth.currentUser?.uid;

  useEffect(() => {
    AsyncStorage.getItem(PRIVATE_KEY)
      .then((v) => {
        if (v === '1') setShowPrivate(true);
      })
      .catch(() => {});
  }, []);

  const togglePrivate = () => {
    setShowPrivate((on) => {
      const next = !on;
      if (next) setFriendFilter('all');
      AsyncStorage.setItem(PRIVATE_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shared, local, profile, photoUri] = await Promise.all([
        getMySharedEvents(),
        getEvents().catch(() => []),
        getProfile().catch(() => ({ displayName: '' })),
        getProfilePhotoUri().catch(() => null),
      ]);
      const email = auth.currentUser?.email || '';
      const displayName =
        profile?.displayName ||
        auth.currentUser?.displayName ||
        (email || 'You').split('@')[0];
      setMe({
        displayName,
        photoUri,
        initial: (displayName || 'Y').charAt(0).toUpperCase(),
        email,
      });

      const sharedList = shared || [];
      const localList = local || [];
      const byShare = {};
      localList.forEach((ev) => {
        if (ev?.shareId) byShare[ev.shareId] = ev;
      });
      setLocalByShareId(byShare);
      const visibleShared = sharedList.filter((s) =>
        hasActiveOtherParticipants(s, auth.currentUser?.uid),
      );
      setSharedEvents(visibleShared);
      const sharedIds = new Set(visibleShared.map((s) => s.id));
      setPersonalEvents(
        localList.filter((ev) => {
          if (!ev) return false;
          if (ev.shareId && sharedIds.has(ev.shareId)) return false;
          if (ev.isShared) return false;
          return true;
        }),
      );
    } catch (e) {
      console.warn('Events with friends load failed', e);
      setSharedEvents([]);
      setPersonalEvents([]);
      setLocalByShareId({});
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const allFriends = useMemo(() => {
    const map = {};
    sharedEvents.forEach((ev) => {
      listOtherParticipants(ev, myUid).forEach((f) => {
        if (!map[f.uid]) map[f.uid] = f;
      });
    });
    return Object.values(map);
  }, [sharedEvents, myUid]);

  const friendRoster = allFriends.slice(0, 4);

  const primaryFriendColour =
    (friendRoster[0] && friendRoster[0].colour) || FRIEND_COLOURS[1] || FRIEND_PINK;

  const filteredShared = useMemo(() => {
    if (friendFilter === 'all') return sharedEvents;
    return sharedEvents.filter((s) =>
      listOtherParticipants(s, myUid).some((f) => f.uid === friendFilter),
    );
  }, [sharedEvents, friendFilter, myUid]);

  const filteredPersonal = friendFilter === 'all' && showPrivate ? personalEvents : [];

  const rows = useMemo(() => {
    const mixed = [
      ...filteredShared.map((shared) => ({
        kind: 'shared',
        date: shared.date || '',
        shared,
        friends: listOtherParticipants(shared, myUid),
      })),
      ...filteredPersonal.map((event) => ({
        kind: 'personal',
        date: event.date || '',
        event,
      })),
    ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    const out = [];
    let lastYear = null;
    let lastMonth = null;
    let lastWeek = null;
    let side = 'left';
    mixed.forEach((entry) => {
      const d = parseDate(entry.date) || new Date();
      const year = d.getFullYear();
      const month = `${year}-${d.getMonth()}`;
      const week = weekKey(d);
      if (year !== lastYear) {
        out.push({ type: 'year', year });
        lastYear = year;
        lastMonth = null;
        lastWeek = null;
      }
      if (month !== lastMonth) {
        out.push({ type: 'month', year, month: monthLabel(d) });
        lastMonth = month;
        lastWeek = null;
      }
      if (week !== lastWeek) {
        out.push({ type: 'week', label: weekLabel(d) });
        lastWeek = week;
      }
      const colour =
        entry.kind === 'personal'
          ? PRIVATE_COLOUR
          : side === 'left'
            ? ME_COLOUR
            : primaryFriendColour;
      out.push({
        type: 'event',
        kind: entry.kind,
        side,
        colour,
        item: entry,
      });
      side = side === 'left' ? 'right' : 'left';
    });
    return out;
  }, [filteredShared, filteredPersonal, myUid, primaryFriendColour]);

  const spanText = useMemo(() => friendshipSpan(filteredShared), [filteredShared]);

  const openShared = useCallback(
    (item) => {
      const shared = item.shared;
      const local =
        (shared && localByShareId[shared.id]) ||
        (shared && {
          id: shared.sourceEventId || shared.id,
          title: shared.title,
          description: shared.description || '',
          date: shared.date,
          category: shared.category || 'personal',
          shareId: shared.id,
          isShared: true,
        });
      navigateToEvent(navigation, local);
    },
    [navigation, localByShareId],
  );

  const openPersonal = useCallback(
    (event) => navigateToEvent(navigation, event),
    [navigation],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const isEmpty = filteredShared.length === 0 && filteredPersonal.length === 0;
  const friendInitial =
    (friendRoster[0] && (friendRoster[0].displayName || 'F').charAt(0).toUpperCase()) || 'F';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <View style={styles.avatarRow}>
            <Avatar name={me.initial} photoUri={me.photoUri} colour={ME_COLOUR} />
            <Text style={styles.peopleMark}>👥</Text>
            {friendRoster.length > 0 ? (
              friendRoster.map((f) => (
                <Avatar
                  key={f.uid}
                  name={f.displayName}
                  photoUri={f.photoUri}
                  colour={f.colour || primaryFriendColour}
                />
              ))
            ) : (
              <Avatar name={friendInitial} colour={primaryFriendColour} />
            )}
          </View>
          <Text style={styles.screenTitle}>Events with friends</Text>
          <View style={styles.titleRule} />
          <Text style={styles.subtitle}>
            {spanText || 'Only events shared with friends'}
          </Text>
          {spanText ? (
            <Text style={styles.subtitleFine}>Years, months and weeks sit on the centre axis</Text>
          ) : null}
        </View>

        {allFriends.length > 1 ? (
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.filterChip, friendFilter === 'all' && styles.filterChipOn]}
              onPress={() => setFriendFilter('all')}
            >
              <Text style={[styles.filterChipText, friendFilter === 'all' && styles.filterChipTextOn]}>
                All friends
              </Text>
            </TouchableOpacity>
            {allFriends.map((f) => {
              const on = friendFilter === f.uid;
              const label = f.displayName || f.initial || 'Friend';
              return (
                <TouchableOpacity
                  key={f.uid}
                  style={[styles.filterChip, on && styles.filterChipOn]}
                  onPress={() => setFriendFilter(f.uid)}
                >
                  <Text style={[styles.filterChipText, on && styles.filterChipTextOn]} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <TouchableOpacity style={styles.privateToggle} onPress={togglePrivate}>
          <Text style={styles.tick}>{showPrivate ? '☑' : '☐'}</Text>
          <Text style={styles.privateToggleText}>Show private items on this screen</Text>
        </TouchableOpacity>

        <View style={styles.timeline}>
          <View style={styles.spineCapTop} />
          <View style={styles.centreSpine} />
          <View style={styles.spineCapBottom} />

          {isEmpty ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {friendFilter !== 'all' ? 'Nothing shared with this friend yet' : 'No shared events yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {showPrivate
                  ? 'No items match this view.'
                  : 'Private items stay off this screen unless you tick Show private. Share an event or enter an invite code.'}
              </Text>
            </View>
          ) : (
            rows.map((row, idx) => {
              if (row.type === 'year') {
                return (
                  <View key={`y-${row.year}`} style={styles.markerRow}>
                    <View style={styles.yearBox}>
                      <Text style={styles.yearText}>{row.year}</Text>
                    </View>
                  </View>
                );
              }
              if (row.type === 'month') {
                return (
                  <View key={`m-${row.year}-${row.month}-${idx}`} style={styles.markerRow}>
                    <View style={styles.monthBox}>
                      <Text style={styles.monthText}>{row.month}</Text>
                    </View>
                  </View>
                );
              }
              if (row.type === 'week') {
                return (
                  <View key={`w-${row.label}-${idx}`} style={styles.markerRow}>
                    <Text style={styles.weekText}>{row.label}</Text>
                  </View>
                );
              }
              const left = row.side === 'left';
              const card =
                row.kind === 'personal' ? (
                  <PersonalCard
                    event={row.item.event}
                    colour={row.colour}
                    onPress={() => openPersonal(row.item.event)}
                  />
                ) : (
                  <SharedCard
                    item={row.item}
                    meLabel={me.initial}
                    myEmail={me.email}
                    colour={row.colour}
                    onPress={() => openShared(row.item)}
                  />
                );
              const key =
                row.kind === 'personal'
                  ? `p-${row.item.event.id || idx}`
                  : row.item.shared.id || `e-${idx}`;
              return (
                <View key={key} style={styles.pairRow}>
                  <View style={styles.sideSlot}>
                    {left ? (
                      <View style={styles.personalWrap}>
                        {card}
                        <Curve colour={row.colour} side="left" />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.spineGap} />
                  <View style={styles.sideSlot}>
                    {!left ? (
                      <View style={[styles.personalWrap, styles.personalWrapRight]}>
                        <Curve colour={row.colour} side="right" />
                        {card}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('AcceptInvite')}
        >
          <Text style={styles.buttonText}>Enter invite code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.ghost]} onPress={load}>
          <Text style={styles.ghostText}>Refresh</Text>
        </TouchableOpacity>
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  center: {
    flex: 1,
    backgroundColor: '#0a0a12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { paddingHorizontal: 10, paddingBottom: 110, paddingTop: 16 },
  headerBlock: { alignItems: 'center', marginBottom: 10 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  avatar: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontWeight: '800' },
  peopleMark: { fontSize: 18, color: '#94a3b8' },
  screenTitle: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  titleRule: {
    width: 36,
    height: 2,
    backgroundColor: '#334155',
    marginTop: 8,
    borderRadius: 1,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  subtitleFine: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 140,
  },
  filterChipOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  filterChipText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  filterChipTextOn: { color: '#fff' },
  privateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 6,
  },
  tick: { color: '#c4b5fd', fontSize: 18 },
  privateToggleText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  timeline: {
    position: 'relative',
    minHeight: 260,
    paddingVertical: 18,
    marginBottom: 12,
  },
  centreSpine: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: '50%',
    marginLeft: -1,
    width: 2,
    borderRadius: 2,
    backgroundColor: SPINE_COLOUR,
    opacity: 0.7,
  },
  spineCapTop: {
    position: 'absolute',
    top: 2,
    left: '50%',
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: SPINE_COLOUR,
    backgroundColor: '#0a0a12',
    zIndex: 2,
  },
  spineCapBottom: {
    position: 'absolute',
    bottom: 2,
    left: '50%',
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: SPINE_COLOUR,
    backgroundColor: '#0a0a12',
    zIndex: 2,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    minHeight: 88,
  },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    zIndex: 4,
  },
  sideSlot: {
    flex: 1,
    minWidth: 0,
  },
  spineGap: { width: 8 },
  markerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    zIndex: 6,
  },
  yearBox: {
    backgroundColor: '#0a0a12',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  yearText: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  monthBox: {
    backgroundColor: '#0a0a12',
    borderWidth: 1,
    borderColor: '#64748b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  monthText: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  weekText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#0a0a12',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  personalWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  personalWrapRight: {
    justifyContent: 'flex-start',
  },
  curveCol: {
    width: CURVE,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 18,
  },
  curveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: -2,
    zIndex: 2,
  },
  personalCard: {
    backgroundColor: '#16182a',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    width: CARD_W,
    maxWidth: CARD_W,
  },
  personalHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  sharedCard: {
    backgroundColor: '#16182a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#475569',
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: CENTRE_CARD_W,
    maxWidth: CENTRE_CARD_W,
    alignItems: 'center',
    zIndex: 5,
  },
  sharedGlyph: { fontSize: 16, marginBottom: 4, color: '#e2e8f0' },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  centreAlign: { textAlign: 'center', alignSelf: 'stretch' },
  cardDate: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 3,
  },
  cardSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3,
  },
  fromFriend: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  footerCentre: { justifyContent: 'center' },
  cardFooterText: { fontSize: 11, fontWeight: '600' },
  emptyBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#12131f',
    marginHorizontal: 8,
    marginTop: 24,
  },
  emptyTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 16, marginBottom: 8 },
  emptyBody: { color: '#94a3b8', lineHeight: 20, fontSize: 14 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#475569',
  },
  ghostText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
});
