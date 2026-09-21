import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getEvents,
  getWeekStart,
  getDayBubbleSummaries,
  getDayBubblePreviewBlurbs,
  getMonthName,
  EVENTS_FIRESTORE_SYNC_ENABLED,
} from '../services/eventService';
import HomeFab from '../components/HomeFab';
import SpineKindBlock from '../components/SpineKindBlock';
import EventLabelChips from '../components/EventLabelChips';
import { getShowFoodInMenu, getShowWashInMenu } from '../services/profileService';

function buildBubbleFilterFromParams(params) {
  if (!params) return null;
  const kind = params.kind;
  const bubbleFilter = params.bubbleFilter;
  const category = params.category ?? bubbleFilter?.category;
  const source = params.source ?? bubbleFilter?.source;
  const hobbyType = params.hobbyType ?? bubbleFilter?.hobbyType;
  if (!kind && !category && !source && !hobbyType && !bubbleFilter) return null;
  return {
    ...(bubbleFilter && typeof bubbleFilter === 'object' ? bubbleFilter : {}),
    ...(category != null && category !== '' ? { category } : {}),
    ...(source != null && source !== '' ? { source } : {}),
    ...(hobbyType != null && hobbyType !== '' ? { hobbyType } : {}),
    ...(kind ? { kind } : {}),
  };
}

function toIsoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekFromParams(params) {
  const year = params?.year ?? new Date().getFullYear();
  const month = params?.month ?? new Date().getMonth();
  if (params?.weekStart) {
    const d = new Date(`${String(params.weekStart).slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return getWeekStart(d);
  }
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() === month) return getWeekStart(now);
  return getWeekStart(new Date(year, month, 1));
}

function formatWeekTitle(days) {
  if (!days?.length) return '';
  const start = days[0];
  const end = days[6];
  if (start.monthName === end.monthName && start.year === end.year) {
    return `${start.dayOfMonth}–${end.dayOfMonth} ${start.monthName} ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.dayOfMonth} ${start.monthName} – ${end.dayOfMonth} ${end.monthName} ${start.year}`;
  }
  return `${start.dayOfMonth} ${start.monthName} ${start.year} – ${end.dayOfMonth} ${end.monthName} ${end.year}`;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekOverviewScreen({ navigation, route }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showFoodInMenu, setShowFoodInMenu] = useState(false);
  const [showWashInMenu, setShowWashInMenu] = useState(true);
  const [activeFilter, setActiveFilter] = useState(() => buildBubbleFilterFromParams(route.params));
  const [filterLabel, setFilterLabel] = useState(() => route.params?.label || '');
  const [preview, setPreview] = useState(null);
  const [weekStart, setWeekStart] = useState(() => weekFromParams(route.params));

  useEffect(() => {
    setActiveFilter(buildBubbleFilterFromParams(route.params));
    setFilterLabel(route.params?.label || '');
    setWeekStart(weekFromParams(route.params));
  }, [
    route.params?.year,
    route.params?.month,
    route.params?.weekStart,
    route.params?.kind,
    route.params?.label,
    route.params?.category,
    route.params?.source,
    route.params?.hobbyType,
    route.params?.bubbleFilter,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEvents();
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      getShowFoodInMenu().then(setShowFoodInMenu).catch(() => setShowFoodInMenu(false));
      getShowWashInMenu().then(setShowWashInMenu).catch(() => setShowWashInMenu(true));
    }, [load])
  );

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = getWeekStart(weekStart);
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      date.setHours(0, 0, 0, 0);
      out.push({
        date,
        weekdayShort: WEEKDAY_SHORT[i],
        dayOfMonth: date.getDate(),
        monthName: getMonthName(date.getMonth()),
        year: date.getFullYear(),
        isoDate: toIsoDay(date),
        isToday: date.getTime() === today.getTime(),
      });
    }
    return out;
  }, [weekStart]);

  const daysWithBubbles = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        bubbles: getDayBubbleSummaries(events, day.date, activeFilter || undefined),
      })),
    [days, events, activeFilter]
  );

  const glowKey = useMemo(() => {
    let best = null;
    let bestCount = 0;
    daysWithBubbles.forEach((d) => {
      (d.bubbles || []).forEach((b) => {
        if (b.count > bestCount) {
          bestCount = b.count;
          best = `${d.isoDate}:${b.kind}`;
        }
      });
    });
    return best;
  }, [daysWithBubbles]);

  const goWeek = (delta) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * 7);
    const start = getWeekStart(next);
    setWeekStart(start);
    navigation.setParams({
      year: start.getFullYear(),
      month: start.getMonth(),
      weekStart: toIsoDay(start),
    });
  };

  const chipText = filterLabel || activeFilter?.kind || 'Filter';

  const clearFilter = () => {
    setActiveFilter(null);
    setFilterLabel('');
    setPreview(null);
    navigation.setParams({
      kind: undefined,
      label: undefined,
      category: undefined,
      source: undefined,
      hobbyType: undefined,
      bubbleFilter: undefined,
    });
  };

  const openEvent = (item) => {
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
    else if (item.source === 'location') navigation.navigate('AddLocation', { event: item });
    else if (item.source === 'life') navigation.navigate('AddLifeEvent', { event: item });
    else if (item.hobbyType === 'poetry') navigation.navigate('AddPoem', { event: item });
    else if (item.source === 'qr') navigation.navigate('AddQr', { event: item });
    else navigation.navigate('AddEvent', { event: item });
  };

  const openDay = (day) => {
    navigation.navigate('Timeline', { year: day.year, month: day.date.getMonth() });
  };

  const openBubble = (day, bubble) => {
    const filter = { kind: bubble.kind, ...(bubble.filter || {}) };
    const blurbs = getDayBubblePreviewBlurbs(events, day.date, filter, 6);
    setPreview({ day, bubble, blurbs });
  };

  const zoomInFromPreview = () => {
    if (!preview) return;
    const { day } = preview;
    setPreview(null);
    openDay(day);
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

  const title = formatWeekTitle(days);
  const previewTitle = preview
    ? `${preview.day?.weekdayShort || ''} ${preview.day?.dayOfMonth || ''} · ${preview.bubble?.label || 'Events'}`
    : '';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => goWeek(-1)} accessibilityLabel="Previous week">
            <Text style={styles.weekNavBtn}>‹</Text>
          </TouchableOpacity>
          <View style={styles.titleCol}>
            <Text style={styles.kicker}>{getMonthName(weekStart.getMonth())} {weekStart.getFullYear()}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <TouchableOpacity onPress={() => goWeek(1)} accessibilityLabel="Next week">
            <Text style={styles.weekNavBtn}>›</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.intro}>
          Same central axis as years and months: one week, days in boxes, type-bubbles on the sides.
        </Text>
        {activeFilter ? (
          <View style={styles.chipRow}>
            <TouchableOpacity style={styles.clearChip} onPress={clearFilter} activeOpacity={0.85}>
              <Text style={styles.clearChipText}>{chipText} ×</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.spine} />
        {daysWithBubbles.map((day, index) => (
          <SpineKindBlock
            key={day.isoDate}
            id={day.isoDate}
            label={day.weekdayShort}
            sublabel={String(day.dayOfMonth)}
            current={day.isToday}
            bubbles={day.bubbles}
            blockIndex={index}
            glowKey={glowKey}
            boxedLabel
            onOpenLabel={() => openDay(day)}
            onOpenBubble={(bubble) => openBubble(day, bubble)}
          />
        ))}
      </ScrollView>

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
              { label: 'Email', action: () => navigation.navigate('AddEvent', { fromEmail: true }) },
              { label: 'Hobby', action: () => navigation.navigate('AddEvent', { fromHobby: true }) },
              { label: 'Poem', action: () => navigation.navigate('AddPoem') },
              { label: 'YouTube', action: () => navigation.navigate('YouTube') },
              { label: 'Spotify', action: () => navigation.navigate('Spotify') },
              { label: 'SMS', action: () => navigation.navigate('AddSms') },
              { label: 'Phone call', action: () => navigation.navigate('AddCall') },
              { label: 'Location', action: () => navigation.navigate('AddLocation') },
              { label: 'Life event', action: () => navigation.navigate('AddLifeEvent') },
              { label: 'QR link', action: () => navigation.navigate('AddQr') },
              ...(showFoodInMenu ? [{ label: 'Food', action: () => navigation.navigate('AddFood') }] : []),
              ...(showWashInMenu ? [{ label: 'Wash load', action: () => navigation.navigate('AddWashLoad') }] : []),
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

      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPreview(null)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{previewTitle}</Text>
              <TouchableOpacity onPress={() => setPreview(null)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.blurbList}>
              {(preview?.blurbs || []).length === 0 ? (
                <Text style={styles.blurbEmpty}>No events in this bubble yet.</Text>
              ) : (
                (preview?.blurbs || []).map((b) => (
                  <TouchableOpacity
                    key={b.id || `${b.title}-${b.dateLabel}`}
                    style={styles.blurbRow}
                    onPress={() => {
                      setPreview(null);
                      openEvent(b.event);
                    }}
                  >
                    <Text style={styles.blurbTitle} numberOfLines={1}>
                      {b.title}
                    </Text>
                    <Text style={styles.blurbDate}>{b.dateLabel}</Text>
                    <EventLabelChips labels={b.labels} />
                  </TouchableOpacity>
                ))
              )}
            </View>
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomInFromPreview} activeOpacity={0.85}>
              <Text style={styles.zoomBtnText}>Zoom in</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1024' },
  center: { flex: 1, backgroundColor: '#0f1024', justifyContent: 'center', alignItems: 'center' },
  syncHint: { marginTop: 12, color: '#94a3b8', fontSize: 14 },
  scroll: { paddingVertical: 16, paddingHorizontal: 10, paddingBottom: 100 },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    zIndex: 2,
  },
  weekNavBtn: { color: '#c4b5fd', fontSize: 32, fontWeight: '700', paddingHorizontal: 8 },
  titleCol: { flex: 1, alignItems: 'center' },
  kicker: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  intro: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 18,
    zIndex: 2,
  },
  chipRow: { alignItems: 'center', marginBottom: 12, zIndex: 2 },
  clearChip: {
    backgroundColor: '#1a1b36',
    borderWidth: 1.5,
    borderColor: '#8b5cf6',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearChipText: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
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
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: { color: '#fff', fontSize: 32, marginTop: -2 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  menu: {
    backgroundColor: '#1a1b36',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  menuTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  menuItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  menuItemText: { color: '#e2e8f0', fontSize: 16 },
  menuCancel: { paddingVertical: 14, alignItems: 'center' },
  menuCancelText: { color: '#94a3b8', fontSize: 15 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
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
  sheetTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', flex: 1, paddingRight: 12 },
  sheetClose: { color: '#94a3b8', fontSize: 18, fontWeight: '700', paddingHorizontal: 4 },
  blurbList: { marginBottom: 16, gap: 10 },
  blurbRow: {
    backgroundColor: '#0f1024',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2a2b4a',
  },
  blurbTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  blurbDate: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  blurbEmpty: { color: '#94a3b8', fontSize: 14, paddingVertical: 8 },
  zoomBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  zoomBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
