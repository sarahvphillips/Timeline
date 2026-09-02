import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getEvents, getMonthSummaries } from '../services/eventService';

export default function MonthOverviewScreen({ navigation, route }) {
  const startYear = route.params?.year || new Date().getFullYear();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    const data = await getEvents();
    setEvents(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const yearsToShow = [startYear, startYear + 1];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

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
        <View style={styles.spine} />
        {yearsToShow.map((year) => {
          const months = getMonthSummaries(events, year);
          return (
            <View key={year} style={styles.yearBlock}>
              <Text style={styles.yearLabel}>{year}</Text>
              {months.map((m, index) => {
                const left = index % 2 === 0;
                const isCurrent = year === currentYear && m.month === currentMonth;
                return (
                  <View key={`${year}-${m.month}`} style={styles.row}>
                    {left ? (
                      m.count > 0 ? (
                        <TouchableOpacity
                          style={[styles.bubble, styles.bubbleLeft]}
                          onPress={() =>
                            navigation.navigate('Timeline', { year, month: m.month })
                          }
                        >
                          <Text style={styles.count}>{m.count}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.tickSide} />
                      )
                    ) : (
                      <View style={styles.tickSide} />
                    )}

                    <TouchableOpacity
                      style={styles.monthCol}
                      onPress={() =>
                        navigation.navigate('Timeline', { year, month: m.month })
                      }
                      accessibilityLabel={`Open ${m.name} ${year}`}
                    >
                      <View style={[styles.tick, m.count > 0 && styles.tickActive]} />
                      {m.count > 0 ? <View style={styles.eventPip} /> : null}
                      <Text style={[styles.letter, isCurrent && styles.letterCurrent]}>
                        {m.letter}
                      </Text>
                      {m.count > 0 ? (
                        <View style={styles.indicatorRow}>
                          {(m.categories || []).slice(0, 4).map((color) => (
                            <View key={color} style={[styles.catDot, { backgroundColor: color }]} />
                          ))}
                        </View>
                      ) : null}
                      {isCurrent ? <Text style={styles.nowMark}>★</Text> : null}
                    </TouchableOpacity>

                    {!left ? (
                      m.count > 0 ? (
                        <TouchableOpacity
                          style={[styles.bubble, styles.bubbleRight]}
                          onPress={() =>
                            navigation.navigate('Timeline', { year, month: m.month })
                          }
                        >
                          <Text style={styles.count}>{m.count}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.tickSide} />
                      )
                    ) : (
                      <View style={styles.tickSide} />
                    )}
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
    paddingVertical: 24,
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 18,
    marginLeft: -9,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
  },
  yearBlock: {
    marginBottom: 16,
  },
  yearLabel: {
    textAlign: 'center',
    color: '#a78bfa',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    marginBottom: 8,
  },
  monthCol: {
    width: 52,
    alignItems: 'center',
    paddingVertical: 4,
  },
  tick: {
    width: 22,
    height: 4,
    backgroundColor: '#64748b',
    marginBottom: 4,
  },
  tickActive: {
    backgroundColor: '#8b5cf6',
  },
  eventPip: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
    marginBottom: 3,
    borderWidth: 2,
    borderColor: '#c4b5fd',
  },
  indicatorRow: {
    flexDirection: 'row',
    marginTop: 3,
    gap: 3,
  },
  catDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  letter: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: '800',
  },
  letterCurrent: {
    color: '#fde047',
  },
  nowMark: {
    color: '#fde047',
    fontSize: 16,
    marginTop: 2,
    fontWeight: '700',
  },
  bubble: {
    minWidth: 56,
    backgroundColor: '#1a1b36',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  bubbleLeft: {
    marginRight: 8,
    marginLeft: 'auto',
  },
  bubbleRight: {
    marginLeft: 8,
    marginRight: 'auto',
  },
  tickSide: {
    flex: 1,
  },
  count: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
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
