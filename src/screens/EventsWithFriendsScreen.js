import React, { useState, useCallback, useMemo } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../services/firebase';
import {
  getMySharedEvents,
  listOtherParticipants,
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

function PersonalCard({ item, colour, onPress }) {
  const ev = item.event;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.personalCard, { borderColor: colour + '66' }]}
    >
      <View style={styles.personalHead}>
        <Text style={{ color: colour, fontSize: 16 }}>{cardGlyph(ev)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {ev.title || 'Untitled'}
          </Text>
          <Text style={[styles.cardDate, { color: colour }]}>{formatDateLabel(ev.date)}</Text>
        </View>
      </View>
      {ev.description ? (
        <Text style={styles.cardSub} numberOfLines={1}>
          {ev.description}
        </Text>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={{ color: colour, fontSize: 11 }}>🔒</Text>
        <Text style={[styles.cardFooterText, { color: colour }]}>Personal only</Text>
      </View>
    </TouchableOpacity>
  );
}

function SharedCard({ item, meLabel, myEmail, onPress }) {
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
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.sharedCard}>
      <Text style={styles.sharedGlyph}>👥</Text>
      <Text style={[styles.cardTitle, styles.centreAlign]} numberOfLines={2}>
        {shared.title || 'Shared event'}
      </Text>
      <Text style={[styles.cardDate, styles.centreAlign]}>
        {dateBit}
        {time ? ` · ${time}` : ''}
      </Text>
      <Text style={[styles.cardSub, styles.centreAlign]} numberOfLines={1}>
        {withLabel}
      </Text>
      {fromOther ? (
        <Text style={styles.fromFriend} numberOfLines={1}>
          From friend
        </Text>
      ) : null}
      <View style={[styles.cardFooter, styles.footerCentre]}>
        <Text style={{ fontSize: 11, color: '#94a3b8' }}>🔒</Text>
        <Text style={[styles.cardFooterText, { color: '#94a3b8' }]}>Shared event</Text>
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
  const myUid = auth.currentUser?.uid;

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
      const sharedIds = new Set(sharedList.map((s) => s.id));
      const byShare = {};
      localList.forEach((ev) => {
        if (ev?.shareId) byShare[ev.shareId] = ev;
      });
      setLocalByShareId(byShare);
      setSharedEvents(sharedList);
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

  const friendRoster = useMemo(() => {
    const map = {};
    sharedEvents.forEach((ev) => {
      listOtherParticipants(ev, myUid).forEach((f) => {
        if (!map[f.uid]) map[f.uid] = f;
      });
    });
    return Object.values(map).slice(0, 2);
  }, [sharedEvents, myUid]);

  const primaryFriendColour =
    (friendRoster[0] && friendRoster[0].colour) || FRIEND_COLOURS[1] || FRIEND_PINK;

  const rows = useMemo(() => {
    const mixed = [
      ...personalEvents.map((event) => ({
        kind: 'personal',
        date: event.date || '',
        event,
      })),
      ...sharedEvents.map((shared) => ({
        kind: 'shared',
        date: shared.date || '',
        shared,
        friends: listOtherParticipants(shared, myUid),
      })),
    ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    const out = [];
    mixed.forEach((item) => {
      if (item.kind === 'shared') {
        out.push({ type: 'shared', item });
        return;
      }
      const last = out[out.length - 1];
      if (last && last.type === 'pair' && !last.right) last.right = item;
      else out.push({ type: 'pair', left: item, right: null });
    });
    return out;
  }, [personalEvents, sharedEvents, myUid]);

  const openPersonal = useCallback(
    (event) => navigateToEvent(navigation, event),
    [navigation],
  );

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const isEmpty = rows.length === 0;
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
          <Text style={styles.subtitle}>Shared moments and your own memories</Text>
        </View>

        <View style={styles.timeline}>
          <View style={styles.spineCapTop} />
          <View style={styles.centreSpine} />
          <View style={styles.spineCapBottom} />

          {isEmpty ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>
                Personal timeline items sit on the left and right. Shared events sit on the centre
                spine.
              </Text>
            </View>
          ) : (
            rows.map((row, idx) => {
              if (row.type === 'shared') {
                return (
                  <View key={row.item.shared.id || `s-${idx}`} style={styles.sharedRow}>
                    <View style={styles.sideSlot} />
                    <SharedCard
                      item={row.item}
                      meLabel={me.initial}
                      myEmail={me.email}
                      onPress={() => openShared(row.item)}
                    />
                    <View style={styles.sideSlot} />
                  </View>
                );
              }
              return (
                <View key={`p-${idx}`} style={styles.pairRow}>
                  <View style={styles.sideSlot}>
                    {row.left ? (
                      <View style={styles.personalWrap}>
                        <PersonalCard
                          item={row.left}
                          colour={ME_COLOUR}
                          onPress={() => openPersonal(row.left.event)}
                        />
                        <Curve colour={ME_COLOUR} side="left" />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.spineGap} />
                  <View style={styles.sideSlot}>
                    {row.right ? (
                      <View style={[styles.personalWrap, styles.personalWrapRight]}>
                        <Curve colour={primaryFriendColour} side="right" />
                        <PersonalCard
                          item={row.right}
                          colour={primaryFriendColour}
                          onPress={() => openPersonal(row.right.event)}
                        />
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
