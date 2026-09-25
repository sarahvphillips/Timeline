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
  getMonthBubbleSummaries,
  getMonthBubblePreviewBlurbs,
  EVENTS_FIRESTORE_SYNC_ENABLED,
} from '../services/eventService';
import HomeFab from '../components/HomeFab';
import SpineKindBlock, { SpineStage } from '../components/SpineKindBlock';
import FilteredMonthSpine from '../components/FilteredMonthSpine';
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

function weekNavParams(year, month, filter, label) {
  const base = { year, month };
  if (!filter) return base;
  return {
    ...base,
    kind: filter.kind,
    label: label || undefined,
    category: filter.category,
    source: filter.source,
    hobbyType: filter.hobbyType,
    bubbleFilter: filter,
  };
}

export default function MonthOverviewScreen({ navigation, route }) {
  const startYear = route.params?.year || new Date().getFullYear();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showFoodInMenu, setShowFoodInMenu] = useState(false);
  const [showWashInMenu, setShowWashInMenu] = useState(true);
  const [activeFilter, setActiveFilter] = useState(() => buildBubbleFilterFromParams(route.params));
  const [filterLabel, setFilterLabel] = useState(() => route.params?.label || '');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setActiveFilter(buildBubbleFilterFromParams(route.params));
    setFilterLabel(route.params?.label || '');
  }, [
    route.params?.year,
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

  const now = new Date();
  const months = useMemo(
    () => getMonthBubbleSummaries(events, startYear, activeFilter || undefined),
    [events, startYear, activeFilter]
  );

  const glowKey = useMemo(() => {
    let best = null;
    let bestCount = 0;
    months.forEach((m) => {
      (m.bubbles || []).forEach((b) => {
        if (b.count > bestCount) {
          bestCount = b.count;
          best = `${startYear}-${m.month}:${b.kind}`;
        }
      });
    });
    return best;
  }, [months, startYear]);

  const chipText = filterLabel || activeFilter?.kind || 'Filter';
  const filtered = !!activeFilter;
  const chipIcon =
    /poem/i.test(chipText) || activeFilter?.hobbyType === 'poetry' || activeFilter?.kind === 'poem'
      ? '📖'
      : '●';

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

  const openMonth = (monthIndex) => {
    navigation.navigate('WeekOverview', weekNavParams(startYear, monthIndex, activeFilter, filterLabel));
  };

  const openBubble = (monthRow, bubble) => {
    const filter = {
      kind: bubble.kind,
      ...(bubble.filter || {}),
    };
    const blurbs = getMonthBubblePreviewBlurbs(events, startYear, monthRow.month, filter, 6);
    setPreview({ monthRow, bubble, blurbs });
  };

  const zoomInFromPreview = () => {
    if (!preview) return;
    const { monthRow, bubble } = preview;
    const filter = {
      kind: bubble.kind,
      ...(bubble.filter || {}),
    };
    setPreview(null);
    navigation.navigate(
      'WeekOverview',
      weekNavParams(startYear, monthRow.month, filter, bubble.label)
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

  const previewTitle = preview
    ? `${preview.monthRow?.short || ''} ${startYear} · ${preview.bubble?.label || 'Events'}`
    : '';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, filtered && styles.scrollFiltered]} directionalLockEnabled nestedScrollEnabled>
        <Text style={[styles.yearHeading, filtered && styles.yearHeadingFiltered]}>
          {filtered ? `${startYear} Months` : String(startYear)}
        </Text>
        {filtered ? null : (
          <Text style={styles.intro}>
            Same as years: month on the central axis, type-bubbles on spokes. Tap a bubble, then zoom in to the weeks.
          </Text>
        )}
        {activeFilter ? (
          <View style={[styles.chipRow, styles.chipRowFiltered]}>
            <TouchableOpacity
              style={styles.poemsChip}
              onPress={clearFilter}
              accessibilityLabel={`Clear filter ${chipText}`}
              activeOpacity={0.85}
            >
              <Text style={styles.poemsChipIcon}>{chipIcon}</Text>
              <Text style={styles.poemsChipText}>{chipText}</Text>
              <Text style={styles.poemsChipX}>×</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {filtered ? (
          <FilteredMonthSpine
            months={months}
            year={startYear}
            now={now}
            filterLabel={chipText}
            onOpenMonth={openMonth}
          />
        ) : (
          <SpineStage>
            <View style={styles.spine} />
            {months.map((m, index) => (
              <SpineKindBlock
                key={`${startYear}-${m.month}`}
                id={`${startYear}-${m.month}`}
                label={m.short}
                current={startYear === now.getFullYear() && m.month === now.getMonth()}
                bubbles={m.bubbles}
                blockIndex={index}
                glowKey={glowKey}
                boxedLabel
                onOpenLabel={() => openMonth(m.month)}
                onOpenBubble={(bubble) => openBubble(m, bubble)}
              />
            ))}
          </SpineStage>
        )}
      </ScrollView>

      <HomeFab navigation={navigation} besidePlus={false} />
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
              { label: 'Singing / music', action: () => navigation.navigate('AddSinging') },
              { label: 'YouTube', action: () => navigation.navigate('YouTube') },
              { label: 'Spotify', action: () => navigation.navigate('Spotify') },
              { label: 'SMS', action: () => navigation.navigate('AddSms') },
              { label: 'Phone call', action: () => navigation.navigate('AddCall') },
              { label: 'Location', action: () => navigation.navigate('AddLocation') },
              { label: 'Life event', action: () => navigation.navigate('AddLifeEvent') },
              { label: 'QR link', action: () => navigation.navigate('AddQr') },
              ...(showFoodInMenu
                ? [{ label: 'Food', action: () => navigation.navigate('AddFood') }]
                : []),
              ...(showWashInMenu
                ? [{ label: 'Wash load', action: () => navigation.navigate('AddWashLoad') }]
                : []),
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
              <TouchableOpacity onPress={() => setPreview(null)} accessibilityLabel="Close preview">
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
                    activeOpacity={0.85}
                    onPress={() => {
                      const ev = b.event || events.find((e) => e.id === b.id);
                      if (!ev) return;
                      setPreview(null);
                      navigation.navigate('EventView', { event: ev });
                    }}
                  >
                    <View style={styles.blurbTop}>
                      <Text style={styles.blurbTitle} numberOfLines={1}>
                        {b.title}
                      </Text>
                      <Text style={styles.blurbOpen}>Open</Text>
                    </View>
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
  container: {
    flex: 1,
    backgroundColor: '#0f1024',
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
    paddingVertical: 28,
    paddingHorizontal: 10,
    paddingBottom: 100,
  },
  scrollFiltered: {
    paddingHorizontal: 18,
    paddingBottom: 140,
  },
  yearHeading: {
    textAlign: 'center',
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
    zIndex: 2,
  },
  yearHeadingFiltered: {
    textAlign: 'left',
    color: '#c4b5fd',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 14,
    paddingLeft: 6,
  },
  intro: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 24,
    zIndex: 2,
  },
  chipRow: {
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 2,
  },
  chipRowFiltered: {
    alignItems: 'flex-start',
    paddingLeft: 6,
    marginBottom: 18,
  },
  clearChip: {
    backgroundColor: '#1a1b36',
    borderWidth: 1.5,
    borderColor: '#8b5cf6',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearChipText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  poemsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 16, 80, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.45)',
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  poemsChipIcon: { fontSize: 16, marginRight: 8 },
  poemsChipText: { color: '#e9d5ff', fontSize: 16, fontWeight: '600' },
  poemsChipX: { color: '#c4b5fd', fontSize: 18, marginLeft: 10, marginTop: -1 },
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
    bottom: 96,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 21,
    shadowColor: '#c4b5fd',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 32,
    marginTop: -2,
  },
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
  blurbTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blurbTitle: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  blurbOpen: { color: '#93c5fd', fontSize: 13, fontWeight: '700' },
  blurbDate: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
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
