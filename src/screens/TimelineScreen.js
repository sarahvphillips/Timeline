import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Linking,
  Animated,
  Modal,
  Pressable,
  Image,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getEvents,
  deleteEvent,
  getCategoryColor,
  CATEGORIES,
  getNextActionLabel,
  getHobbyTypeLabel,
  getHobbyTypeIcon,
  buildGrokReplyPrompt,
  filterEventsByYearMonth,
  getMonthName,
  EVENTS_FIRESTORE_SYNC_ENABLED,
  washStatusLabel,
  washTumbleLabel,
  TIMELINE_FILTERS,
  eventMatchesTimelineFilter,
} from '../services/eventService';
import HomeFab from '../components/HomeFab';
import DesignTargetButton from '../components/DesignTargetButton';
import {
  getEventFriendSourceLabel,
  isSharedEventInvitee,
  leaveSharedEvent,
  getSharedEvent,
  formatRecentLeftNotice,
  countPendingSuggestions,
} from '../services/shareService';
import { auth } from '../services/firebase';
import { getShowFoodInMenu, getShowWashInMenu } from '../services/profileService';

const GROK_URL = 'https://grok.x.ai';

export default function TimelineScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const year = route.params?.year;
  const month = route.params?.month;
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(!!route.params?.openMenu);
  const [filterId, setFilterId] = useState(route.params?.filter || 'all');
  const [showFoodInMenu, setShowFoodInMenu] = useState(false);
  const [showWashInMenu, setShowWashInMenu] = useState(true);
  const [shareNotices, setShareNotices] = useState({});
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (message) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2800),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(null));
  };

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEvents();
      setAllEvents(data);
      const myUid = auth.currentUser?.uid;
      const notices = {};
      if (myUid) {
        const creatorShareIds = [
          ...new Set(
            data
              .filter((e) => e.shareId && !isSharedEventInvitee(e, myUid))
              .map((e) => e.shareId),
          ),
        ].slice(0, 24);
        await Promise.all(
          creatorShareIds.map(async (sid) => {
            try {
              const shared = await getSharedEvent(sid);
              if (!shared) return;
              if (shared.createdByUid && shared.createdByUid !== myUid) return;
              const left = !!formatRecentLeftNotice(shared);
              const sug = countPendingSuggestions(shared) > 0;
              if (left || sug) notices[sid] = { left, sug };
            } catch (_) {}
          }),
        );
      }
      setShareNotices(notices);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
      getShowFoodInMenu().then(setShowFoodInMenu).catch(() => setShowFoodInMenu(false));
      getShowWashInMenu().then(setShowWashInMenu).catch(() => setShowWashInMenu(true));
    }, [loadEvents])
  );

  const scoped =
    year != null && month != null
      ? filterEventsByYearMonth(allEvents, year, month)
      : allEvents;
  const events = scoped
    .filter((e) => eventMatchesTimelineFilter(e, filterId))
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const activeFilter = TIMELINE_FILTERS.find((f) => f.id === filterId) || TIMELINE_FILTERS[0];
  const useSpine =
    (year != null && month != null && width >= 400) ||
    (activeFilter.itemView && width >= 360);

  const heading =
    year != null && month != null
      ? `${getMonthName(month)} ${year}${filterId !== 'all' ? ` · ${activeFilter.label}` : ''}`
      : filterId === 'all'
        ? 'All events'
        : `All ${activeFilter.label}`;

  const handleDelete = async (event) => {
    const myUid = auth.currentUser?.uid;
    const invitee = isSharedEventInvitee(event, myUid);
    const title = invitee ? 'Leave event' : 'Delete event';
    const message = invitee
      ? `Leave "${event.title}"? This removes it from your timeline only. Your friend keeps their event.`
      : (`Delete "${event.title}"? This removes it from this device` +
        (auth.currentUser ? ' and from your cloud copy.' : '.') +
        (event?.isShared || event?.shareId
          ? ' As the creator, deleting your copy may end the share for you; friends keep their copies until they leave.'
          : ''));
    let ok = false;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      ok = window.confirm(title + '\n\n' + message);
    } else {
      ok = await new Promise((resolve) => {
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: invitee ? 'Leave' : 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
    }
    if (!ok) return;
    try {
      if (invitee) {
        await leaveSharedEvent(event);
        const updated = await getEvents();
        setAllEvents(updated);
      } else {
        const updated = await deleteEvent(event.id);
        setAllEvents(updated);
      }
    } catch (e) {
      const fail = e?.message || (invitee ? 'Could not leave.' : 'Could not delete.');
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert((invitee ? 'Could not leave' : 'Could not delete') + '\n\n' + fail);
      } else {
        Alert.alert(invitee ? 'Could not leave' : 'Could not delete', fail);
      }
    }
  };

  const openGrok = async () => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(GROK_URL, '_blank', 'noopener,noreferrer');
      } else {
        await Linking.openURL(GROK_URL);
      }
    } catch {
      Alert.alert('Open Grok', GROK_URL);
    }
  };

  const handleAskGrok = async (event) => {
    const prompt = buildGrokReplyPrompt(event);
    if (Platform.OS === 'web' && navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(prompt);
        showToast('Copied! Opening Grok ÔÇö paste (Ctrl+V)');
        setTimeout(() => openGrok(), 400);
        return;
      } catch {
        /* fall through */
      }
    }
    Alert.alert('Ask Grok', prompt, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Grok', onPress: openGrok },
    ]);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderCard = (item) => {
    const color = getCategoryColor(item.category);
    const expanded = expandedId === item.id;
    const labels = item.labels || [];

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setExpandedId(expanded ? null : item.id)}
        onLongPress={() => handleDelete(item)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.date}>{formatDate(item.date)}</Text>
          <View style={[styles.categoryBadge, { backgroundColor: color + '33' }]}>
            <Text style={[styles.categoryText, { color }]}>
              {CATEGORIES.find((c) => c.id === item.category)?.label || 'Other'}
            </Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={expanded ? 4 : 2}>
          {item.title}
        </Text>
        {item.shareId && shareNotices[item.shareId] ? (
          <View style={styles.noticeFlagRow}>
            {shareNotices[item.shareId].left ? (
              <Text style={styles.noticeFlag}>Friend left</Text>
            ) : null}
            {shareNotices[item.shareId].sug ? (
              <Text style={[styles.noticeFlag, styles.noticeFlagSug]}>Note suggested</Text>
            ) : null}
          </View>
        ) : null}

        {expanded && (
          <View style={styles.expanded}>
            {item.location ? (
              <Text style={styles.hobbyMeta}>Location · {item.location}</Text>
            ) : null}
            {item.source === 'food' ? (
              <Text style={styles.hobbyMeta}>
                {item.foodStatus === 'planned' ? 'Planned' : 'Eaten'}
                {item.foodItems ? ` — ${item.foodItems}` : ''}
              </Text>
            ) : null}
            {item.source === 'laundry' ? (
              <Text style={styles.hobbyMeta}>
                Household · {washStatusLabel(item.washStatus) || 'Wash'}
                {item.washTumble ? ` · ${washTumbleLabel(item.washTumble)}` : ''}
                {item.washSang ? ` · sang${item.washSangAt ? ' ' + item.washSangAt : ''}` : ''}
              </Text>
            ) : null}

            {item.source === 'hobby' && item.hobbyType ? (
              <Text style={styles.hobbyMeta}>
                {getHobbyTypeIcon(item.hobbyType)} {getHobbyTypeLabel(item.hobbyType)}
                {item.collectionName ? `  -À  ${item.collectionName}` : ''}
              </Text>
            ) : null}

            {labels.length > 0 ? (
              <View style={styles.labelRow}>
                {labels.map((lab) => (
                  <View key={lab} style={styles.chip}>
                    <Text style={styles.chipText}>{lab}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {item.emailFrom ? (
              <Text style={styles.meta}>From: {item.emailFrom}</Text>
            ) : null}
            {item.coverImageUri ? (
              <Image source={{ uri: item.coverImageUri }} style={styles.eventImage} resizeMode="cover" />
            ) : null}
            {item.coverPhotoNote ? (
              <Text style={styles.meta}>Cover: {item.coverPhotoNote}</Text>
            ) : null}
            {item.imageUri ? (
              <Image source={{ uri: item.imageUri }} style={styles.eventImage} resizeMode="cover" />
            ) : null}
            {item.videoUri ? (
              <Text style={styles.meta}>Video saved on this device</Text>
            ) : null}
            {item.source === 'laundry' && Array.isArray(item.washCodes) && item.washCodes.length ? (
              <Text style={styles.meta}>
                {item.washCodes
                  .map((c) => [c.code, c.time].filter(Boolean).join(' '))
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
            {item.photoNote ? (
              <Text style={styles.meta}>{item.imageUri ? item.photoNote : 'Photo: ' + item.photoNote}</Text>
            ) : null}
            {item.qrLink ? (
              <View style={styles.qrBlock}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(item.qrLink)}`,
                  }}
                  style={styles.qrImage}
                />
                <Text style={styles.meta}>{item.qrLink}</Text>
              </View>
            ) : null}
            {item.description ? (
              <Text style={styles.description}>{item.description}</Text>
            ) : null}

            {item.nextAction && item.nextAction !== 'none' ? (
              <View style={styles.nextRow}>
                <Text style={styles.nextLabel}>
                  Next: {getNextActionLabel(item.nextAction)}
                </Text>
                {item.nextAction === 'ask_grok_reply' && (
                  <TouchableOpacity style={styles.grokButton} onPress={() => handleAskGrok(item)}>
                    <Text style={styles.grokButtonText}>Ô£ª Ask Grok</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => {
                if (item.source === 'food') navigation.navigate('AddFood', { event: item });
                else if (item.source === 'laundry') navigation.navigate('AddWashLoad', { event: item });
                else if (item.source === 'youtube') navigation.navigate('YouTube', { event: item });
                else if (item.source === 'spotify') navigation.navigate('Spotify', { event: item });
                else if (item.source === 'game') navigation.navigate('Games', { event: item });
                else if (item.source === 'social') navigation.navigate('Social', { event: item });
                else if (item.source === 'sms') navigation.navigate('AddSms', { event: item });
                else if (item.source === 'call') navigation.navigate('AddCall', { event: item });
                else if (item.hobbyType === 'poetry') navigation.navigate('AddPoem', { event: item });
                else if (item.source === 'qr') navigation.navigate('AddQr', { event: item });
                else navigation.navigate('AddEvent', { event: item });
              }}
            >
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)}>
              <Text style={styles.deleteLink}>
                {isSharedEventInvitee(item, auth.currentUser?.uid) ? 'Leave event' : 'Delete'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ShareEvent', { event: item })}>
              <Text style={styles.shareLink}>Share with a friend</Text>
            </TouchableOpacity>
            {(() => {
              const sourceLabel = getEventFriendSourceLabel(item, auth.currentUser?.uid);
              return sourceLabel ? (
                <Text style={styles.sharedBadge}>{sourceLabel}</Text>
              ) : null;
            })()}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item, index }) => {
    const d = new Date(item.date);
    const showYear =
      activeFilter.itemView &&
      (!events[index - 1] || new Date(events[index - 1].date).getFullYear() !== d.getFullYear());
    const yearMark = showYear ? (
      <Text style={styles.yearMark}>{d.getFullYear()}</Text>
    ) : null;

    if (!useSpine) {
      return (
        <View>
          {yearMark}
          {renderCard(item)}
        </View>
      );
    }

    const left = index % 2 === 0;
    return (
      <View>
        {yearMark}
        <View style={styles.spineRow}>
          {left ? <View style={styles.spineCard}>{renderCard(item)}</View> : <View style={styles.spineGap} />}
          <View style={styles.spineDotCol}>
            <View style={styles.itemDot} />
            <Text style={styles.dayMark}>{d.getDate()}</Text>
          </View>
          {!left ? <View style={styles.spineCard}>{renderCard(item)}</View> : <View style={styles.spineGap} />}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        {EVENTS_FIRESTORE_SYNC_ENABLED ? (
          <Text style={styles.syncHint}>Syncing events…</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {TIMELINE_FILTERS.map((f) => {
          const on = filterId === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, on && styles.filterChipOn]}
              onPress={() => setFilterId(f.id)}
            >
              <Text style={[styles.filterText, on && styles.filterTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No items yet</Text>
          <Text style={styles.emptyText}>Tap + to add an event, email, hobby or poem.</Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          {useSpine ? <View style={styles.itemSpine} /> : null}
          <FlatList
            data={events}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEvents(); }} tintColor="#3b82f6" />
            }
          />
        </View>
      )}

      {/* TEMP design target — remove when timeline / events-year matches sketch. */}
      <DesignTargetButton
        imageSource={require('../../assets/design-events-year.png')}
        title="Events year design (temp)"
      />
      <HomeFab navigation={navigation} />
      <TouchableOpacity style={styles.fab} onPress={() => setMenuOpen(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Add</Text>
            {[
              { label: 'Event', action: () => navigation.navigate('AddEvent') },
              { label: 'Add from email', action: () => navigation.navigate('AddEvent', { fromEmail: true, source: 'email' }) },
              { label: 'Hobby', action: () => navigation.navigate('AddEvent', { fromHobby: true }) },
              { label: 'Poem', action: () => navigation.navigate('AddPoem') },
              { label: 'Games', action: () => navigation.navigate('Games') },
              { label: 'Social media', action: () => navigation.navigate('Social') },
              { label: 'YouTube', action: () => navigation.navigate('YouTube') },
              { label: 'Spotify', action: () => navigation.navigate('Spotify') },
              { label: 'SMS', action: () => navigation.navigate('AddSms') },
              { label: 'Phone call', action: () => navigation.navigate('AddCall') },
              { label: 'QR link', action: () => navigation.navigate('AddQr') },
              ...(showFoodInMenu
                ? [{ label: 'Food', action: () => navigation.navigate('AddFood') }]
                : []),
              ...(showWashInMenu
                ? [{ label: 'Wash load', action: () => navigation.navigate('AddWashLoad') }]
                : []),
              { label: 'Word to Int', action: () => navigation.navigate('WordToInt') },
              { label: 'Days between dates', action: () => navigation.navigate('DateSpan') },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  opt.action();
                }}
              >
                <Text style={styles.menuItemText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuOpen(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {toastMessage ? (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  center: { flex: 1, backgroundColor: '#0f1024', justifyContent: 'center', alignItems: 'center' },
  syncHint: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  heading: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  filters: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipOn: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  filterText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  filterTextOn: { color: '#fff' },
  yearMark: {
    color: '#c4b5fd',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  list: { padding: 16, paddingBottom: 120 },
  listWrap: { flex: 1 },
  itemSpine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 4,
    marginLeft: -2,
    backgroundColor: '#8b5cf6',
  },
  spineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  spineCard: { flex: 1, minWidth: 0 },
  spineGap: { flex: 1 },
  spineDotCol: {
    width: 36,
    alignItems: 'center',
    paddingTop: 16,
  },
  itemDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8b5cf6',
  },
  dayMark: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  date: { color: '#94a3b8', fontSize: 13 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  categoryText: { fontSize: 12, fontWeight: '600' },
  title: { color: '#f8fafc', fontSize: 17, fontWeight: '600' },
  expanded: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#334155' },
  hobbyMeta: { color: '#c4b5fd', fontSize: 13, marginBottom: 6 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: '#c4b5fd', fontSize: 12 },
  meta: { color: '#64748b', fontSize: 13, marginBottom: 4 },
  description: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextLabel: { color: '#60a5fa', fontSize: 13, flex: 1 },
  grokButton: { backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  grokButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  qrBlock: { alignItems: 'flex-start', marginBottom: 8 },
  qrImage: { width: 140, height: 140, maxWidth: '100%', backgroundColor: '#fff', borderRadius: 8, marginBottom: 6 },
  eventImage: { width: '100%', height: 180, maxWidth: '100%', backgroundColor: '#0f1024', borderRadius: 10, marginBottom: 8 },
  shareLink: { color: '#c4b5fd', fontSize: 14, fontWeight: '600', marginTop: 8 },
  sharedBadge: { color: '#34d399', fontSize: 12, marginTop: 8, fontWeight: '600' },
  noticeFlagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  noticeFlag: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#422006',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  noticeFlagSug: {
    color: '#bfdbfe',
    backgroundColor: '#1e3a5f',
    borderColor: '#3b82f6',
  },
  editLink: { color: '#60a5fa', marginTop: 8, fontSize: 13 },
  deleteLink: { color: '#f87171', marginTop: 8, fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#94a3b8', textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: { color: '#fff', fontSize: 32, marginTop: -2 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  menu: {
    backgroundColor: '#1a1b36',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  menuTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  menuItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  menuItemText: { color: '#e2e8f0', fontSize: 16 },
  menuCancel: { paddingVertical: 14, alignItems: 'center' },
  menuCancelText: { color: '#94a3b8', fontSize: 15 },
  toast: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    right: 20,
    backgroundColor: '#1a1b36',
    borderColor: '#3b82f6',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  toastText: { color: '#f8fafc' },
});
