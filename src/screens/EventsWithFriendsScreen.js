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
} from '../services/shareService';
import { getProfile, getProfilePhotoUri } from '../services/profileService';
import HomeFab from '../components/HomeFab';
const { width: SCREEN_W } = Dimensions.get('window');

function Avatar({ name, photoUri, colour, size = 44 }) {
  const initial = (name || 'Y').charAt(0).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderColor: colour }]}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.avatarText, { color: colour, fontSize: size * 0.4 }]}>{initial}</Text>
      )}
    </View>
  );
}

function FriendPathSegment({ colour, side, meet }) {
  // Approximate curve: lane -> bend toward centre at shared node -> veer away
  const laneX = side === 'left' ? 28 : SCREEN_W - 52;
  const centreX = SCREEN_W / 2 - 2;
  return (
    <View style={styles.pathSeg} pointerEvents="none">
      <View
        style={[
          styles.laneLine,
          {
            backgroundColor: colour,
            left: laneX,
            opacity: meet ? 0.35 : 0.85,
          },
        ]}
      />
      {meet ? (
        <View
          style={[
            styles.connector,
            {
              backgroundColor: colour,
              left: side === 'left' ? laneX + 4 : centreX,
              width: Math.abs(centreX - laneX) - 4,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export default function EventsWithFriendsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [sharedEvents, setSharedEvents] = useState([]);
  const [me, setMe] = useState({ displayName: 'You', photoUri: null, initial: 'Y' });

  const myUid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [events, profile, photoUri] = await Promise.all([
        getMySharedEvents(),
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
      setSharedEvents(events);
    } catch (e) {
      console.warn('Events with friends load failed', e);
      setSharedEvents([]);
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
    return Object.values(map).slice(0, 3);
  }, [sharedEvents, myUid]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Your spine stays in the centre. Friends&apos; coloured lines meet yours only at shared
          events, then veer away again.
        </Text>

        <View style={styles.avatarRow}>
          <View style={styles.avatarCol}>
            <Avatar name={me.displayName} photoUri={me.photoUri} colour="#8b5cf6" />
            <Text style={styles.avatarLabel} numberOfLines={1}>
              You
            </Text>
          </View>
          {friendRoster.map((f) => (
            <View key={f.uid} style={styles.avatarCol}>
              <Avatar name={f.displayName} photoUri={f.photoUri} colour={f.colour} />
              <Text style={[styles.avatarLabel, { color: f.colour }]} numberOfLines={1}>
                {f.displayName}
              </Text>
            </View>
          ))}
          {friendRoster.length === 0 ? (
            <Text style={styles.noFriends}>Share an event, then accept from another account.</Text>
          ) : null}
        </View>

        <View style={styles.timeline}>
          <View style={styles.centreSpine} />

          {friendRoster.map((f, idx) => (
            <View
              key={`lane-${f.uid}`}
              style={[
                styles.friendLane,
                {
                  backgroundColor: f.colour,
                  left: idx % 2 === 0 ? 36 : undefined,
                  right: idx % 2 === 1 ? 36 : undefined,
                },
              ]}
            />
          ))}

          {sharedEvents.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No shared events yet</Text>
              <Text style={styles.emptyBody}>
                From Add Event or a timeline card, tap Share with a friend. On the other account,
                enter the invite code here.
              </Text>
            </View>
          ) : (
            sharedEvents.map((ev, index) => {
              const friends = listOtherParticipants(ev, myUid);
              const dateLabel = ev.date
                ? new Date(ev.date).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '';
              return (
                <View key={ev.id} style={styles.nodeBlock}>
                  {friends.map((f, fi) => (
                    <FriendPathSegment
                      key={`${ev.id}-${f.uid}`}
                      colour={f.colour}
                      side={fi % 2 === 0 ? 'left' : 'right'}
                      meet
                    />
                  ))}

                  <View style={styles.nodeRow}>
                    <View style={styles.sideCol}>
                      {friends
                        .filter((_, i) => i % 2 === 0)
                        .map((f) => (
                          <View key={f.uid} style={[styles.friendDot, { backgroundColor: f.colour }]} />
                        ))}
                    </View>

                    <View style={styles.centreCol}>
                      <View style={styles.sharedNode}>
                        <Text style={styles.nodeTitle} numberOfLines={2}>
                          {ev.title}
                        </Text>
                        <Text style={styles.nodeDate}>{dateLabel}</Text>
                        <View style={styles.chipRow}>
                          {friends.map((f) => (
                            <View key={f.uid} style={[styles.miniChip, { borderColor: f.colour }]}>
                              <Text style={[styles.miniChipText, { color: f.colour }]}>
                                {f.initial}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>

                    <View style={styles.sideCol}>
                      {friends
                        .filter((_, i) => i % 2 === 1)
                        .map((f) => (
                          <View key={f.uid} style={[styles.friendDot, { backgroundColor: f.colour }]} />
                        ))}
                    </View>
                  </View>

                  {index < sharedEvents.length - 1 ? <View style={styles.soloTick} /> : null}
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
  container: { flex: 1, backgroundColor: '#0f1024' },
  center: {
    flex: 1,
    backgroundColor: '#0f1024',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { padding: 16, paddingBottom: 100 },
  intro: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
    justifyContent: 'center',
  },
  avatarCol: { alignItems: 'center', maxWidth: 80 },
  avatar: {
    backgroundColor: '#1a1b36',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontWeight: '700' },
  avatarLabel: { color: '#c4b5fd', fontSize: 11, marginTop: 6, textAlign: 'center' },
  noFriends: { color: '#64748b', fontSize: 12, maxWidth: 160 },
  timeline: {
    position: 'relative',
    minHeight: 220,
    paddingVertical: 12,
    marginBottom: 16,
  },
  centreSpine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    marginLeft: -5,
    width: 10,
    borderRadius: 6,
    backgroundColor: '#8b5cf6',
  },
  friendLane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 4,
    opacity: 0.55,
  },
  nodeBlock: { marginBottom: 28, position: 'relative' },
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
    top: '48%',
    height: 3,
    borderRadius: 2,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideCol: {
    width: 48,
    alignItems: 'center',
    gap: 6,
  },
  centreCol: {
    flex: 1,
    alignItems: 'center',
  },
  sharedNode: {
    backgroundColor: '#1a1b36',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: 240,
    minWidth: 160,
    alignItems: 'center',
  },
  nodeTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  nodeDate: { color: '#a5b4fc', fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  miniChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniChipText: { fontSize: 11, fontWeight: '700' },
  friendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  soloTick: {
    alignSelf: 'center',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366f1',
    marginTop: 18,
    opacity: 0.7,
  },
  emptyBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#16182e',
    marginHorizontal: 8,
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
