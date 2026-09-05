import React, { useState, useCallback } from 'react';
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
  getWeeksInMonth,
  filterEventsByDay,
  getMonthName,
  getCategoryColor,
  EVENTS_FIRESTORE_SYNC_ENABLED,
} from '../services/eventService';

function formatWeekRange(week) {
  const start = week.days[0];
  const end = week.days[6];
  if (start.monthName === end.monthName && start.year === end.year) {
    return `${start.dayOfMonth}–${end.dayOfMonth} ${start.monthName}`;
  }
  if (start.year === end.year) {
    return `${start.dayOfMonth} ${start.monthName} – ${end.dayOfMonth} ${end.monthName}`;
  }
  return `${start.dayOfMonth} ${start.monthName} ${start.year} – ${end.dayOfMonth} ${end.monthName} ${end.year}`;
}

function formatDayHeader(day) {
  return `${day.weekdayName} ${day.dayOfMonth} ${day.monthName} ${day.year}`;
}

export default function WeekOverviewScreen({ navigation, route }) {
  const year = route.params?.year ?? new Date().getFullYear();
  const month = route.params?.month ?? new Date().getMonth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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
    }, [load])
  );

  const goMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    navigation.setParams({ year: d.getFullYear(), month: d.getMonth() });
  };

  const openEvent = (item) => {
    if (item.hobbyType === 'poetry') navigation.navigate('AddPoem', { event: item });
    else if (item.source === 'qr') navigation.navigate('AddQr', { event: item });
    else navigation.navigate('AddEvent', { event: item });
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

  const weeks = getWeeksInMonth(year, month);
  const title = `${getMonthName(month)} ${year}`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => goMonth(-1)} accessibilityLabel="Previous month">
            <Text style={styles.monthNavBtn}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={() => goMonth(1)} accessibilityLabel="Next month">
            <Text style={styles.monthNavBtn}>›</Text>
          </TouchableOpacity>
        </View>

        {weeks.map((week) => {
          const range = formatWeekRange(week);
          return (
            <View key={week.days[0].isoDate} style={styles.weekBlock}>
              <View style={styles.weekHeader}>
                <Text style={styles.weekRange}>{range}</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Timeline', { year, month })}
                  accessibilityLabel={`See all items in ${getMonthName(month)}`}
                >
                  <Text style={styles.seeAll}>See all in this month</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.strip}>
                {week.days.map((day) => (
                  <View
                    key={day.isoDate}
                    style={[
                      styles.stripDay,
                      day.isToday && styles.stripDayToday,
                      !day.isInMonth && styles.stripDayMuted,
                    ]}
                  >
                    <Text style={[styles.stripName, !day.isInMonth && styles.mutedText]}>
                      {day.weekdayShort}
                    </Text>
                    <Text
                      style={[
                        styles.stripNum,
                        day.isToday && styles.stripNumToday,
                        !day.isInMonth && styles.mutedText,
                      ]}
                    >
                      {day.dayOfMonth}
                    </Text>
                  </View>
                ))}
              </View>

              {week.days.map((day) => {
                const dayEvents = filterEventsByDay(events, day.date);
                return (
                  <View
                    key={day.isoDate}
                    style={[styles.dayBlock, !day.isInMonth && styles.dayBlockMuted]}
                  >
                    <Text
                      style={[
                        styles.dayHeader,
                        day.isToday && styles.dayHeaderToday,
                        !day.isInMonth && styles.mutedText,
                      ]}
                    >
                      {formatDayHeader(day)}
                      {day.isToday ? '  ·  today' : ''}
                    </Text>
                    {dayEvents.map((item) => {
                      const color = getCategoryColor(item.category);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.eventRow}
                          onPress={() => openEvent(item)}
                          accessibilityLabel={`Open ${item.title}`}
                        >
                          <View style={[styles.eventDot, { backgroundColor: color }]} />
                          <Text style={styles.eventTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

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
              { label: 'QR link', action: () => navigation.navigate('AddQr') },
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
  scroll: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthNavBtn: {
    color: '#c4b5fd',
    fontSize: 32,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
  },
  weekBlock: {
    marginBottom: 28,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weekRange: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '800',
  },
  seeAll: {
    color: '#60a5fa',
    fontSize: 13,
  },
  strip: {
    flexDirection: 'row',
    marginBottom: 10,
    backgroundColor: '#1a1b36',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  stripDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  stripDayToday: {
    backgroundColor: '#3b82f633',
  },
  stripDayMuted: {
    opacity: 0.45,
  },
  stripName: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  stripNum: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  stripNumToday: {
    color: '#fde047',
  },
  dayBlock: {
    marginBottom: 12,
    paddingLeft: 4,
  },
  dayBlockMuted: {
    opacity: 0.45,
  },
  dayHeader: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  dayHeaderToday: {
    color: '#fde047',
  },
  mutedText: {
    color: '#64748b',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1b36',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  eventTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
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
});
