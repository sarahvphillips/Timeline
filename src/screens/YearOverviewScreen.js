import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getEvents,
  getYearBubbleSummaries,
  getYearBubblePreviewBlurbs,
  getItemBubblesByYear,
  TIMELINE_FILTERS,
  EVENTS_FIRESTORE_SYNC_ENABLED,
  saveEvent,
} from '../services/eventService';
import { pickFromGallery } from '../services/imagePicker';
import HomeFab from '../components/HomeFab';
import DesignTargetButton from '../components/DesignTargetButton';
import SpineKindBlock from '../components/SpineKindBlock';
import EventLabelChips from '../components/EventLabelChips';

function openTimelineEvent(navigation, item) {
  if (!item) return;
  if (item.source === 'food') navigation.navigate('AddFood', { event: item });
  else if (item.source === 'laundry') navigation.navigate('AddWashLoad', { event: item });
  else if (item.source === 'youtube') navigation.navigate('YouTube', { event: item });
  else if (item.source === 'spotify') navigation.navigate('Spotify', { event: item });
  else if (item.source === 'game') navigation.navigate('Games', { event: item });
  else if (item.source === 'watched' || item.watchKind) navigation.navigate('AddWatched', { event: item });
  else if (item.source === 'social') navigation.navigate('Social', { event: item });
  else if (item.source === 'sms') navigation.navigate('AddSms', { event: item });
  else if (item.source === 'call') navigation.navigate('AddCall', { event: item });
  else if (item.hobbyType === 'poetry' || item.source === 'poem') {
    navigation.navigate('AddPoem', { event: item });
  } else if (item.source === 'qr') navigation.navigate('AddQr', { event: item });
  else navigation.navigate('AddEvent', { event: item });
}

export default function YearOverviewScreen({ navigation, route }) {
  const [years, setYears] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [filterId, setFilterId] = useState(route.params?.filter || 'all');
  const activeFilter = TIMELINE_FILTERS.find((f) => f.id === filterId) || TIMELINE_FILTERS[0];
  const itemView = !!activeFilter.itemView;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEvents();
      setEvents(data);
      setYears(
        (filterId && filterId !== 'all'
          ? getItemBubblesByYear(data, filterId)
          : getYearBubbleSummaries(data))
      );
    } finally {
      setLoading(false);
    }
  }, [filterId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const glowKey = useMemo(() => {
    let best = null;
    let bestCount = 0;
    years.forEach((y) => {
      (y.bubbles || []).forEach((b) => {
        if (b.count > bestCount) {
          bestCount = b.count;
          best = `${y.year}:${b.kind}`;
        }
      });
    });
    return best;
  }, [years]);

  const openYear = (year) => {
    if (filterId && filterId !== 'all') {
      navigation.navigate('MonthOverview', {
        year,
        kind: filterId === 'poems' ? 'poem' : activeFilter.id,
        label: activeFilter.label,
        source: filterId === 'poems' ? undefined : filterId,
        hobbyType: filterId === 'poems' ? 'poetry' : undefined,
      });
      return;
    }
    navigation.navigate('MonthOverview', { year });
  };

  const openBubble = (year, bubble) => {
    if (bubble?.event) {
      const e = bubble.event;
      const d = new Date(e.date);
      setPreview({
        year,
        bubble,
        item: e,
        blurbs: [
          {
            id: e.id,
            title: e.title || 'Untitled',
            dateLabel: Number.isNaN(d.getTime())
              ? ''
              : `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`,
            labels: e.labels || [],
            imageUri: e.imageUri || '',
          },
        ],
      });
      return;
    }
    const filter = {
      kind: bubble.kind,
      ...(bubble.filter || {}),
    };
    const blurbs = getYearBubblePreviewBlurbs(events, year, filter, 6);
    setPreview({ year, bubble, blurbs });
  };

  const closePreview = () => setPreview(null);

  const addPhotoToPreview = async (blurb) => {
    const uri = await pickFromGallery();
    if (!uri) return;
    const ev =
      (blurb?.id && events.find((e) => e.id === blurb.id)) || preview?.item || null;
    if (!ev) return;
    await saveEvent({ ...ev, imageUri: uri });
    setPreview((cur) =>
      cur
        ? {
            ...cur,
            item: cur.item?.id === ev.id ? { ...cur.item, imageUri: uri } : cur.item,
            blurbs: (cur.blurbs || []).map((b) =>
              b.id === ev.id ? { ...b, imageUri: uri } : b
            ),
          }
        : cur
    );
    load();
  };

  const zoomInFromPreview = () => {
    if (!preview) return;
    const { year, bubble, item } = preview;
    setPreview(null);
    if (item) {
      openTimelineEvent(navigation, item);
      return;
    }
    navigation.navigate('MonthOverview', {
      year,
      kind: bubble.kind,
      label: bubble.label,
      category: bubble.filter?.category,
      source: bubble.filter?.source,
      hobbyType: bubble.filter?.hobbyType,
      bubbleFilter: bubble.filter,
    });
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

  const previewTitle = preview
    ? `${preview.year} · ${preview.bubble?.label || preview.bubble?.kind || 'Events'}`
    : '';

  return (
    <View style={styles.container}>
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
      {itemView ? (
        <Text style={styles.filterHint}>
          {activeFilter.label} on the timeline — each bubble is one item, grouped by year.
        </Text>
      ) : null}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.spine} />
        {years.length === 0 ? (
          <Text style={styles.empty}>Nothing in {activeFilter.label} yet.</Text>
        ) : (
          years.map((item, index) => (
          <SpineKindBlock
            key={item.year}
            id={item.year}
            label={String(item.year)}
            bubbles={item.bubbles}
            blockIndex={index}
            glowKey={itemView ? null : glowKey}
            boxedLabel
            onOpenLabel={() => openYear(item.year)}
            onOpenBubble={(bubble) => openBubble(item.year, bubble)}
          />
          ))
        )}
      </ScrollView>
      <DesignTargetButton
        imageSource={require('../../assets/design-year-bubbles.png')}
        title="Year bubbles design (temp)"
      />
      <HomeFab navigation={navigation} besidePlus={false} />

      <Modal
        visible={!!preview}
        transparent
        animationType="slide"
        onRequestClose={closePreview}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closePreview}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{previewTitle}</Text>
              <TouchableOpacity
                onPress={closePreview}
                accessibilityLabel="Close preview"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.blurbList}>
              {(preview?.blurbs || []).length === 0 ? (
                <Text style={styles.blurbEmpty}>No events in this bubble yet.</Text>
              ) : (
                (preview?.blurbs || []).map((b) => (
                  <View key={b.id || `${b.title}-${b.dateLabel}`} style={styles.blurbRow}>
                    <Text style={styles.blurbTitle} numberOfLines={1}>
                      {b.title}
                    </Text>
                    <Text style={styles.blurbDate}>{b.dateLabel}</Text>
                    {b.imageUri ? (
                      <Image source={{ uri: b.imageUri }} style={styles.blurbImage} />
                    ) : null}
                    <EventLabelChips labels={b.labels} />
                    <TouchableOpacity onPress={() => addPhotoToPreview(b)}>
                      <Text style={styles.addPhoto}>{b.imageUri ? 'Change photo' : 'Add photo'}</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={zoomInFromPreview}
              accessibilityLabel="Zoom in to month view"
              activeOpacity={0.85}
            >
              <Text style={styles.zoomBtnText}>{preview?.item ? 'Open' : 'Zoom in'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
  },
  filters: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
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
  filterChipOn: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  filterText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  filterTextOn: { color: '#fff' },
  filterHint: {
    color: '#94a3b8',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  empty: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
  },
  center: {
    flex: 1,
    backgroundColor: '#0f1024',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncHint: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 14,
  },
  scroll: {
    paddingVertical: 36,
    paddingHorizontal: 10,
    paddingBottom: 100,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 3,
    marginLeft: -1.5,
    backgroundColor: '#8b5cf6',
    borderRadius: 2,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1b36',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#2a2b4a',
    maxHeight: '70%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    paddingRight: 12,
  },
  sheetClose: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  blurbList: {
    marginBottom: 16,
    gap: 10,
  },
  blurbRow: {
    backgroundColor: '#0f1024',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2a2b4a',
  },
  blurbTitle: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
  },
  blurbDate: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  blurbImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: '#0f1024',
  },
  addPhoto: {
    color: '#a5b4fc',
    fontWeight: '700',
    marginTop: 8,
    fontSize: 14,
  },
  blurbEmpty: {
    color: '#94a3b8',
    fontSize: 14,
    paddingVertical: 8,
  },
  zoomBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  zoomBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
