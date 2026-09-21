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
import DesignTargetButton from '../components/DesignTargetButton';

const { width: SCREEN_W } = Dimensions.get('window');
const ME_COLOUR = '#2dd4bf';
const SPINE_COLOUR = '#64748b';
const CARD_W = Math.min(148, Math.floor(SCREEN_W * 0.38));
const CENTRE_CARD_W = Math.min(168, Math.floor(SCREEN_W * 0.44));

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

function Avatar({ name, photoUri, colour, size = 48 }) {
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
          backgroundColor: colour,
        },
      ]}
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{initial}</Text>
      )}
    </View>
  );
}

function PeopleIcon({ colour = '#94a3b8', size = 20 }) {
  return (
    <View style={[styles.peopleIconWrap, { width: size + 10, height: size + 10 }]}>
      <Text style={{ color: colour, fontSize: size * 0.9 }}>👥</Text>
    </View>
  );
}

function LockIcon({ colour = ME_COLOUR }) {
  return <Text style={{ color: colour, fontSize: 12 }}>🔒</Text>;
}

/** Approximate lane→spine curve with stacked Views (no SVG). */
function FriendPathSegment({ colour, side, meet }) {
  const laneInset = 10;
  const laneX = side === 'left' ? laneInset : SCREEN_W - laneInset - 3;
  const centreX = SCREEN_W / 2 - 1.5;
  const connectorLeft = side === 'left' ? laneX + 3 : centreX + 3;
  const connectorWidth =
    side === 'left'
      ? Math.max(8, centreX - laneX - 3)
      : Math.max(8, laneX - centreX - 3);

  return (
    <View style={styles.pathSeg} pointerEvents="none">
      <View
        style={[
          styles.laneLine,
          {
            backgroundColor: colour,
            left: laneX,
            opacity: meet ? 0.4 : 0.75,
          },
        ]}
      />
      {meet ? (
        <View
          style={[
            styles.connector,
            {
              backgroundColor: colour,
              left: connectorLeft,
              width: connectorWidth,
              opacity: 0.85,
            },
          ]}
        />
      ) : null}
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

function PersonalCard({ item, colour, side, onPress }) {
  const ev = item.event;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.personalCard,
        side === 'left' ? styles.cardLeft : styles.cardRight,
        { borderColor: colour + '55' },
      ]}
    >
      <Text style={[styles.cardAccent, { color: colour }]} numberOfLines={1}>
        ◆
      </Text>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {ev.title || 'Untitled'}
      </Text>
      <Text style={styles.cardDate}>{formatDateLabel(ev.date)}</Text>
      {ev.description ? (
        <Text style={styles.cardSub} numberOfLines={1}>
          {ev.description}
        </Text>
      ) : null}
      <View style={styles.cardFooter}>
        <LockIcon colour={colour} />
        <Text style={[styles.cardFooterText, { color: colour }]}>Personal only</Text>
      </View>
    </TouchableOpacity>
  );
}

function SharedCard({ item, myUid, meInitial, onPress }) {
  const shared = item.shared;
  const friends = item.friends || [];
  const initials = [meInitial, ...friends.map((f) => f.initial)].filter(Boolean);
  const withLabel =
    initials.length > 1
      ? `With ${initials.join(' and ')}`
      : friends.length
        ? `With ${friends.map((f) => f.displayName).join(', ')}`
        : 'Shared event';

  const isInvitee = shared.createdByUid && myUid && shared.createdByUid !== myUid;
  const fromEmail =
    shared.createdByEmail ||
    (shared.participants &&
      shared.createdByUid &&
      shared.participants[shared.createdByUid] &&
      shared.participants[shared.createdByUid].email) ||
    null;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.sharedCard}>
      <Text style={styles.sharedGlyph}>👥</Text>
      <Text style={[styles.cardTitle, styles.centreAlign]} numberOfLines={2}>
        {shared.title || 'Shared event'}
      </Text>
      <Text style={[styles.cardDate, styles.centreAlign]}>{formatDateLabel(shared.date)}</Text>
      <Text style={[styles.cardSub, styles.centreAlign]} numberOfLines={1}>
        {withLabel}
      </Text>
      {isInvitee ? (
        <Text style={styles.fromFriend} numberOfLines={1}>
          {fromEmail ? `From friend - ${fromEmail}` : 'From friend'}
        </Text>
      ) : null}
      <View style={[styles.cardFooter, styles.footerCentre]}>
        <Text style={{ fontSize: 12, color: '#94a3b8' }}>👥</Text>
        <Text style={[styles.cardFooterText, { color: '#94a3b8' }]}>Shared event</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function EventsWithFriendsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [sharedEvents, setSharedEvents] = useState([]);
  const [localByShareId, setLocalByShareId] = useState({});
  const [me, setMe] = useState({ displayName: 'You', photoUri: null, initial: 'Y' });
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
      const displayName =
        profile?.displayName ||
        auth.currentUser?.displayName ||
        (auth.currentUser?.email || 'You').split('@')[0];
      setMe({
        displayName,
        photoUri,
        initial: (displayName || 'Y').charAt(0).toUpperCase(),
      });

      const sharedList = shared || [];
      const localList = local || [];

      const byShare = {};
      localList.forEach((ev) => {
        if (ev?.shareId) byShare[ev.shareId] = ev;
      });
      setLocalByShareId(byShare);

      setSharedEvents(sharedList);
    } catch (e) {
      console.warn('Events with friends load failed', e);
      setSharedEvents([]);
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
    (friendRoster[0] && friendRoster[0].colour) || FRIEND_COLOURS[1] || '#f472b6';

  /** Chronological merge: furthest past at top (matches design mock spine story). */
  const timelineItems = useMemo(() => {
    const items = [];

    sharedEvents.forEach((shared) => {
      const friends = listOtherParticipants(shared, myUid);
      items.push({
        key: `shared-${shared.id}`,
        kind: 'shared',
        side: 'centre',
        date: shared.date || '',
        shared,
        friends,
        colour: SPINE_COLOUR,
      });
    });

    items.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    return items;
  }, [sharedEvents, myUid]);

  const openItem = useCallback(
    (item) => {
      if (item.kind === 'personal') {
        navigateToEvent(navigation, item.event);
        return;
      }
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
          source:
            shared.createdByUid && shared.createdByUid !== myUid ? 'shared' : undefined,
        });
      navigateToEvent(navigation, local);
    },
    [navigation, localByShareId, myUid],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const isEmpty = timelineItems.length === 0;

  return (
    <View style={styles.container}>
      {/* TEMP design target — remove when friends view matches sketch. */}
      <DesignTargetButton
        imageSource={require('../../assets/design-events-with-friends.png')}
        title="Events with friends design (temp)"
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <View style={styles.avatarRow}>
            <Avatar name={me.displayName} photoUri={me.photoUri} colour={ME_COLOUR} />
            <PeopleIcon colour="#cbd5e1" size={20} />
            {friendRoster.length > 0 ? (
              friendRoster.map((f) => (
                <Avatar
                  key={f.uid}
                  name={f.displayName}
                  photoUri={f.photoUri}
                  colour={f.colour}
                />
              ))
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    borderColor: primaryFriendColour,
                    backgroundColor: '#1a1b36',
                    borderStyle: 'dashed',
                  },
                ]}
              >
                <Text style={{ color: primaryFriendColour, fontSize: 18, fontWeight: '700' }}>
                  ?
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.screenTitle}>Events with friends</Text>
          <Text style={styles.subtitle}>Only events shared with friends.</Text>
          {friendRoster.length > 0 ? (
            <Text style={styles.friendEmails} numberOfLines={2}>
              {friendRoster
                .map((f) => f.email || f.displayName)
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : (
            <Text style={styles.noFriends}>
              Share an event, then accept from another account.
            </Text>
          )}
        </View>

        <View style={styles.timeline}>
          <View style={styles.spineCapTop} />
          <View style={styles.centreSpine} />
          <View style={styles.spineCapBottom} />

          {/* Persistent coloured lanes (me left, friend right — right stays empty/private) */}
          <View
            style={[styles.friendLane, { backgroundColor: ME_COLOUR, left: 12 }]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.friendLane,
              { backgroundColor: primaryFriendColour, right: 12, opacity: 0.45 },
            ]}
            pointerEvents="none"
          />

          {isEmpty ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No shared events yet</Text>
              <Text style={styles.emptyBody}>
                Share an event with a friend, or enter an invite code. Private timeline items stay
                on Timeline — they are hidden here.
              </Text>
            </View>
          ) : (
            timelineItems.map((item) => {
              if (item.kind === 'personal') {
                return (
                  <View key={item.key} style={styles.nodeBlock}>
                    <FriendPathSegment colour={ME_COLOUR} side="left" meet />
                    <View style={styles.nodeRow}>
                      <View style={styles.laneCol}>
                        <PersonalCard
                          item={item}
                          colour={ME_COLOUR}
                          side="left"
                          onPress={() => openItem(item)}
                        />
                      </View>
                      <View style={styles.spineGap} />
                      <View style={styles.laneCol} />
                    </View>
                  </View>
                );
              }

              return (
                <View key={item.key} style={styles.nodeBlock}>
                  {(item.friends || []).slice(0, 2).map((f, fi) => (
                    <FriendPathSegment
                      key={`${item.key}-${f.uid}`}
                      colour={f.colour}
                      side={fi % 2 === 0 ? 'right' : 'left'}
                      meet
                    />
                  ))}
                  {(!item.friends || item.friends.length === 0) && (
                    <FriendPathSegment colour={primaryFriendColour} side="right" meet />
                  )}
                  <View style={styles.nodeRowCentre}>
                    <SharedCard
                      item={item}
                      myUid={myUid}
                      meInitial={me.initial}
                      onPress={() => openItem(item)}
                    />
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
  scroll: { paddingHorizontal: 12, paddingBottom: 110, paddingTop: 44 },
  headerBlock: { alignItems: 'center', marginBottom: 18 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 14,
  },
  avatar: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { color: '#0a0a12', fontWeight: '800' },
  peopleIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  friendEmails: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  noFriends: { color: '#64748b', fontSize: 12, marginTop: 8, textAlign: 'center' },
  timeline: {
    position: 'relative',
    minHeight: 240,
    paddingVertical: 20,
    marginBottom: 16,
  },
  centreSpine: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: '50%',
    marginLeft: -1.5,
    width: 3,
    borderRadius: 2,
    backgroundColor: SPINE_COLOUR,
    opacity: 0.85,
  },
  spineCapTop: {
    position: 'absolute',
    top: 4,
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
    bottom: 4,
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
  friendLane: {
    position: 'absolute',
    top: 16,
    bottom: 16,
    width: 3,
    borderRadius: 3,
    opacity: 0.55,
  },
  pathSeg: {
    ...StyleSheet.absoluteFillObject,
  },
  laneLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  connector: {
    position: 'absolute',
    top: '46%',
    height: 2.5,
    borderRadius: 2,
  },
  nodeBlock: {
    marginBottom: 22,
    position: 'relative',
    minHeight: 88,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nodeRowCentre: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  laneCol: {
    flex: 1,
    alignItems: 'center',
  },
  spineGap: { width: 10 },
  personalCard: {
    backgroundColor: '#16182a',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: CARD_W,
    maxWidth: CARD_W,
  },
  cardLeft: {
    alignSelf: 'flex-start',
    marginLeft: 4,
  },
  cardRight: {
    alignSelf: 'flex-end',
    marginRight: 4,
  },
  sharedCard: {
    backgroundColor: '#16182a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#475569',
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: CENTRE_CARD_W,
    maxWidth: CENTRE_CARD_W,
    alignItems: 'center',
    zIndex: 4,
  },
  cardAccent: { fontSize: 12, marginBottom: 4 },
  sharedGlyph: { fontSize: 14, marginBottom: 4, color: '#e2e8f0' },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  centreAlign: { textAlign: 'center' },
  cardDate: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'stretch',
  },
  cardSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
    alignSelf: 'stretch',
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
    marginTop: 10,
    alignSelf: 'stretch',
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
