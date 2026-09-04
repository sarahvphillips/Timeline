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
} from '../services/eventService';
import HomeFab from '../components/HomeFab';

const GROK_URL = 'https://grok.x.ai';

export default function TimelineScreen({ navigation, route }) {
  const year = route.params?.year;
  const month = route.params?.month;
  const { width } = useWindowDimensions();
  const useSpine = year != null && month != null && width >= 400;
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(!!route.params?.openMenu);
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
    const data = await getEvents();
    setAllEvents(data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  const events =
    year != null && month != null
      ? filterEventsByYearMonth(allEvents, year, month)
      : allEvents;

  const heading =
    year != null && month != null
      ? `${getMonthName(month)} ${year}`
      : 'All events';

  const handleDelete = (event) => {
    Alert.alert('Delete event', `Delete "${event.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = await deleteEvent(event.id);
          setAllEvents(updated);
        },
      },
    ]);
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
        showToast('Copied! Opening Grok ิว๖ paste (Ctrl+V)');
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

        {expanded && (
          <View style={styles.expanded}>
            {item.source === 'hobby' && item.hobbyType ? (
              <Text style={styles.hobbyMeta}>
                {getHobbyTypeIcon(item.hobbyType)} {getHobbyTypeLabel(item.hobbyType)}
                {item.collectionName ? `  -ภ  ${item.collectionName}` : ''}
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
                    <Text style={styles.grokButtonText}>ิฃช Ask Grok</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => {
                if (item.hobbyType === 'poetry') navigation.navigate('AddPoem', { event: item });
                else if (item.source === 'qr') navigation.navigate('AddQr', { event: item });
                else navigation.navigate('AddEvent', { event: item });
              }}
            >
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item, index }) => {
    if (!useSpine) return renderCard(item);

    const left = index % 2 === 0;
    return (
      <View style={styles.spineRow}>
        {left ? <View style={styles.spineCard}>{renderCard(item)}</View> : <View style={styles.spineGap} />}
        <View style={styles.spineDotCol}>
          <View style={styles.itemDot} />
          <Text style={styles.dayMark}>{new Date(item.date).getDate()}</Text>
        </View>
        {!left ? <View style={styles.spineCard}>{renderCard(item)}</View> : <View style={styles.spineGap} />}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
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
              { label: 'QR link', action: () => navigation.navigate('AddQr') },
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
  heading: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingTop: 12,
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
  editLink: { color: '#60a5fa', marginTop: 8, fontSize: 13 },
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
