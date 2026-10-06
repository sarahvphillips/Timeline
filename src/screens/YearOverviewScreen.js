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
  timelineFiltersFor,
  EVENTS_FIRESTORE_SYNC_ENABLED,
  saveEvent,
} from '../services/eventService';
import { getEventCategories } from '../services/profileService';
import { getDateFormat, formatDayMonth } from '../services/dateFormat';
import { pickFromGallery, asImageUri } from '../services/imagePicker';
import HomeFab from '../components/HomeFab';
import SpineKindBlock, { SpineStage } from '../components/SpineKindBlock';
import EventLabelChips from '../components/EventLabelChips';
import { useTheme } from '../themeContext';

export default function YearOverviewScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => screenStyles(colors), [colors]);
  const [years, setYears] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [filterId, setFilterId] = useState(route.params?.filter || 'all');
  const [filters, setFilters] = useState(TIMELINE_FILTERS);
  const [dateFormat, setDateFormat] = useState('dmy');
  const activeFilter = filters.find((f) => f.id === filterId) || filters[0];
  const itemView = !!activeFilter.itemView;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEvents();
      const cats = await getEventCategories().catch(() => []);
      setFilters(timelineFiltersFor(cats));
      setEvents(data);
      const nextFormat = await getDateFormat().catch(() => 'dmy');
      setDateFormat(nextFormat);
      setYears(
        (filterId && filterId !== 'all'
          ? getItemBubblesByYear(data, filterId, nextFormat)
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

  const openMonth = (year, month) => {
    const params = { year, focusMonth: month };
    if (filterId && filterId !== 'all') {
      params.kind = filterId === 'poems' ? 'poem' : activeFilter.id;
      params.label = activeFilter.label;
      params.source = filterId === 'poems' ? undefined : filterId;
      params.hobbyType = filterId === 'poems' ? 'poetry' : undefined;
    }
    navigation.navigate('MonthOverview', params);
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
            dateLabel: Number.isNaN(d.getTime()) ? '' : `${formatDayMonth(d, dateFormat)} ${d.getFullYear()}`,
            labels: e.labels || [],
            imageUri: e.imageUri || '',
            event: e,
          },
        ],
      });
      return;
    }
    const filter = {
      kind: bubble.kind,
      ...(bubble.filter || {}),
    };
    const blurbs = getYearBubblePreviewBlurbs(events, year, filter);
    setPreview({ year, bubble, blurbs });
  };

  const closePreview = () => setPreview(null);

  const addPhotoToPreview = async (blurb) => {
    const uri = asImageUri(await pickFromGallery());
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

  const openBlurb = (blurb) => {
    const ev = blurb?.event || events.find((e) => e.id === blurb?.id);
    if (!ev) return;
    setPreview(null);
    navigation.navigate('EventView', { event: ev });
  };

  const zoomInFromPreview = () => {
    if (!preview) return;
    const { year, bubble, item } = preview;
    setPreview(null);
    if (item) {
      navigation.navigate('EventView', { event: item });
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
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          style={styles.filterScroll}
          contentContainerStyle={styles.filters}
        >
          {filters.map((f) => {
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
        <View pointerEvents="none" style={styles.filterFade}>
          <Text style={styles.filterFadeMark}>›</Text>
        </View>
      </View>
      {itemView ? (
        <Text style={styles.filterHint}>
          {activeFilter.label} on the timeline — each bubble is one item, grouped by year.
        </Text>
      ) : null}
      <ScrollView contentContainerStyle={styles.scroll} directionalLockEnabled nestedScrollEnabled>
        {years.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>
              {filterId === 'all'
                ? 'Nothing on your timeline yet.'
                : `Nothing in ${activeFilter.label} yet.`}
            </Text>
            {filterId === 'all' ? (
              <>
                <Text style={styles.emptyHint}>
                  Tap Add event or Add poem. Then it shows up on this year line.
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('AddEvent')}
                >
                  <Text style={styles.emptyBtnText}>Add event</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.emptyGhost}
                  onPress={() => navigation.navigate('AddPoem')}
                >
                  <Text style={styles.emptyGhostText}>Add poem</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptyHint}>Switch the filter to All, or add one of this type.</Text>
            )}
          </View>
        ) : (
          <SpineStage>
            <View style={styles.spine} />
            {years.map((item, index) => (
              <SpineKindBlock
                key={item.year}
                id={item.year}
                label={String(item.year)}
                bubbles={item.bubbles}
                months={item.months}
                blockIndex={index}
                glowKey={itemView ? null : glowKey}
                boxedLabel
                onOpenLabel={() => openYear(item.year)}
                onOpenMonth={(month) => openMonth(item.year, month)}
                onOpenBubble={(bubble) => openBubble(item.year, bubble)}
              />
            ))}
          </SpineStage>
        )}
      </ScrollView>
      <HomeFab navigation={navigation} besidePlus={false} />

      <Modal
        visible={!!preview}
        transparent
        animationType="slide"
        onRequestClose={closePreview}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closePreview}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
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
            <ScrollView
              style={styles.blurbScroll}
              contentContainerStyle={styles.blurbList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {(preview?.blurbs || []).length === 0 ? (
                <Text style={styles.blurbEmpty}>No events in this bubble yet.</Text>
              ) : (
                (preview?.blurbs || []).map((b) => (
                  <TouchableOpacity
                    key={b.id || `${b.title}-${b.dateLabel}`}
                    style={styles.blurbRow}
                    onPress={() => openBlurb(b)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.blurbTop}>
                      <Text style={styles.blurbTitle} numberOfLines={1}>
                        {b.title}
                      </Text>
                      <Text style={styles.blurbOpen}>Open</Text>
                    </View>
                    <Text style={styles.blurbDate}>{b.dateLabel}</Text>
                    {asImageUri(b.imageUri) ? (
                      <Image source={{ uri: asImageUri(b.imageUri) }} style={styles.blurbImage} />
                    ) : null}
                    <EventLabelChips labels={b.labels} />
                    <TouchableOpacity onPress={() => addPhotoToPreview(b)}>
                      <Text style={styles.addPhoto}>{b.imageUri ? 'Change photo' : 'Add photo'}</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={zoomInFromPreview}
              accessibilityLabel="Zoom in to month view"
              activeOpacity={0.85}
            >
              <Text style={styles.zoomBtnText}>{preview?.item ? 'Open' : 'Zoom in'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function screenStyles(c) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
  },
  filterBar: {
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: c.bg,
    position: 'relative',
  },
  filterFade: {
    position: 'absolute',
    right: 0,
    top: 8,
    bottom: 8,
    width: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: c.bg,
    paddingRight: 6,
  },
  filterFadeMark: { color: c.blueSoft, fontSize: 22, fontWeight: '700' },
  filterScroll: {
    flexGrow: 0,
  },
  filters: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    borderWidth: 1,
    borderColor: c.faint,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipOn: {
    backgroundColor: c.spine,
    borderColor: c.spine,
  },
  filterText: { color: c.faint, fontWeight: '700', fontSize: 13 },
  filterTextOn: { color: '#fff' },
  filterHint: {
    color: c.faint,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  empty: {
    color: '#e2e8f0',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyWrap: {
    paddingHorizontal: 28,
    paddingTop: 56,
    alignItems: 'center',
  },
  emptyHint: {
    color: c.faint,
    textAlign: 'center',
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 200,
    alignItems: 'center',
  },
  emptyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyGhost: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: c.faint,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    minWidth: 200,
    alignItems: 'center',
  },
  emptyGhostText: { color: c.faint, fontSize: 15, fontWeight: '600' },
  center: {
    flex: 1,
    backgroundColor: c.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncHint: {
    marginTop: 12,
    color: c.faint,
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
    backgroundColor: c.spine,
    borderRadius: 2,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: c.cardBorder,
    maxHeight: '78%',
  },
  blurbScroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 160,
    maxHeight: 420,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.faint,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    color: c.text,
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    paddingRight: 12,
  },
  sheetClose: {
    color: c.faint,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  blurbList: {
    marginBottom: 16,
    gap: 10,
  },
  blurbRow: {
    backgroundColor: c.bg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  blurbTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blurbTitle: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  blurbOpen: { color: c.blueSoft, fontSize: 13, fontWeight: '700' },
  blurbDate: {
    color: c.faint,
    fontSize: 12,
    marginTop: 4,
  },
  blurbImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: c.bg,
  },
  addPhoto: {
    color: c.muted,
    fontWeight: '700',
    marginTop: 8,
    fontSize: 14,
  },
  blurbEmpty: {
    color: c.faint,
    fontSize: 14,
    paddingVertical: 8,
  },
  zoomBtn: {
    backgroundColor: c.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  zoomBtnText: {
    color: c.text,
    fontSize: 16,
    fontWeight: '800',
  },
});
}

